(function (global) {
  // 配置与错误类型
  const API_CONFIG = global.MYHS_API_CONFIG;
  if (!API_CONFIG) throw new Error('缺少 API 配置');

  const API_ENV = API_CONFIG.environment === 'auto'
    ? (['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(global.location.hostname)
      ? 'local'
      : 'production')
    : API_CONFIG.environment;
  const API_ENV_CONFIG = API_CONFIG.environments[API_ENV];
  if (!API_ENV_CONFIG?.baseUrl) throw new Error(`缺少 ${API_ENV} API 配置`);

  const API_BASE = API_ENV_CONFIG.baseUrl.replace(/\/+$/, '');
  const API_REQUEST_HEADERS = API_ENV_CONFIG.headers || {};
  const API_CONTRACT_VERSION_HEADER = 'X-API-Contract-Version';
  const API_CONTRACT_VERSION = '1';
  const API_ERROR_KIND = Object.freeze({
    HTTP: 'http',
    SSE: 'sse',
    RATE_LIMIT: 'rate_limit',
    NETWORK: 'network',
    DISCONNECT: 'disconnect',
    CONTRACT: 'contract',
    CANCELLED: 'cancelled',
  });

  class ApiRequestError extends Error {
    constructor(errorKind, message, status = null) {
      super(message);
      this.name = 'ApiRequestError';
      this.errorKind = errorKind;
      this.status = status;
    }
  }

  // API 请求
  async function fetchLunarData(solarDateTime, {signal} = {}) {
    const encodedSolarDateTime = encodeURIComponent(solarDateTime);
    const response = await fetchApiResponse(
      `${API_BASE}/api/lunar-data?solar_datetime=${encodedSolarDateTime}`,
      {
        headers: API_REQUEST_HEADERS,
        signal,
      },
    );
    if (!response.ok) throw await createHttpError(response);
    return response;
  }

  async function runSSERequest(path, body, handler, {signal} = {}) {
    const response = await fetchApiResponse(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {...API_REQUEST_HEADERS, 'Content-Type': 'application/json'},
      body,
      signal,
    });
    if (signal?.aborted) throw createCancellationError();
    if (!response.ok) throw await createHttpError(response);
    if (!response.body) {
      throw new ApiRequestError(
        API_ERROR_KIND.DISCONNECT,
        '连接中断，结果未完整返回。',
      );
    }

    // SSE 只有收到 done 才算完整；连接提前结束时提示用户重试。
    let receivedDone = false;
    const reader = response.body.getReader();
    try {
      for await (const sseEvent of streamSSE(reader)) {
        if (sseEvent.event === 'error') {
          throw new ApiRequestError(
            API_ERROR_KIND.SSE,
            parseErrorPayload(sseEvent.data) || '服务处理失败，请稍后重试。',
          );
        }
        if (sseEvent.event === 'done') receivedDone = true;
        handler(sseEvent.event, sseEvent.data);
      }
    } catch (error) {
      // 提前结束时取消读取，避免错误连接继续占用浏览器资源。
      await reader.cancel().catch(() => {});
      if (error instanceof ApiRequestError) throw error;
      if (isAbortError(error) || signal?.aborted) {
        throw createCancellationError();
      }
      throw new ApiRequestError(
        API_ERROR_KIND.DISCONNECT,
        '连接中断，结果未完整返回。',
      );
    } finally {
      reader.releaseLock();
    }

    if (!receivedDone) {
      throw new ApiRequestError(
        API_ERROR_KIND.DISCONNECT,
        '连接中断，结果未完整返回。',
      );
    }
  }

  async function fetchApiResponse(url, options) {
    let response;
    try {
      response = await fetch(url, options);
    } catch (error) {
      if (isAbortError(error) || options?.signal?.aborted) {
        throw createCancellationError();
      }
      // fetch 失败时没有可用的 HTTP 状态，统一归类为网络错误。
      throw new ApiRequestError(
        API_ERROR_KIND.NETWORK,
        '无法连接服务，请检查网络连接后重试。',
      );
    }
    if (options?.signal?.aborted) throw createCancellationError();
    assertApiContract(response);
    return response;
  }

  function isAbortError(error) {
    return error?.name === 'AbortError';
  }

  function createCancellationError() {
    return new ApiRequestError(
      API_ERROR_KIND.CANCELLED,
      '请求已取消。',
    );
  }

  function assertApiContract(response) {
    const version = response.headers.get(API_CONTRACT_VERSION_HEADER);
    if (version !== API_CONTRACT_VERSION) {
      throw new ApiRequestError(
        API_ERROR_KIND.CONTRACT,
        'API 契约版本不匹配，请刷新页面后重试。',
      );
    }
  }

  // HTTP 错误处理
  async function createHttpError(response) {
    const errorKind = response.status === 429
      ? API_ERROR_KIND.RATE_LIMIT
      : API_ERROR_KIND.HTTP;
    const message = await readHttpErrorMessage(response);
    return new ApiRequestError(
      errorKind,
      message || httpErrorFallback(response.status),
      response.status,
    );
  }

  async function readHttpErrorMessage(response) {
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('text/event-stream') && response.body) {
      const reader = response.body.getReader();
      try {
        for await (const sseEvent of streamSSE(reader)) {
          if (sseEvent.event === 'error') return parseErrorPayload(sseEvent.data);
        }
      } catch (_) {
        // 错误响应读取失败时回退到 HTTP 状态码。
      } finally {
        try {
          await reader.cancel();
        } catch (_) {
          // 错误响应已进入失败流程，读取器清理失败不覆盖原始错误。
        }
        reader.releaseLock();
      }
      return '';
    }

    if (!contentType.includes('json')) return '';
    try {
      return errorPayloadMessage(await response.json());
    } catch (_) {
      // 代理返回的错误页可能不是 JSON，使用 HTTP 状态码兜底。
      return '';
    }
  }

  function parseErrorPayload(rawData) {
    try {
      return errorPayloadMessage(JSON.parse(rawData));
    } catch (_) {
      return errorPayloadMessage(rawData);
    }
  }

  function errorPayloadMessage(data) {
    if (typeof data === 'string') return data.trim();
    if (!data || typeof data !== 'object') return '';
    if (typeof data.error === 'string') return data.error.trim();
    if (data.error && typeof data.error === 'object') {
      return String(data.error.message || '').trim();
    }
    return String(data.message || data.detail || '').trim();
  }

  function httpErrorFallback(status) {
    if (status === 429) return '今天已达次数上限，二十四小时后再来';
    if (status === 408 || status === 504) return '服务响应超时，请稍后重试。';
    if (status >= 500) return '服务暂时不可用，请稍后重试。';
    if (status >= 400) return '请求参数有误，请检查后重试。';
    return `HTTP ${status}`;
  }

  // SSE 解析
  async function* streamSSE(reader) {
    const decoder = new TextDecoder(); let buffer = '', eventName = 'message', dataLines = [];
    const flush = function* () {
      if (!dataLines.length) return;
      yield {event: eventName, data: dataLines.join('\n')};
      eventName = 'message';
      dataLines = [];
    };
    const readLine = function* (rawLine) {
      const line = rawLine.replace(/\r$/, '');
      if (!line) {
        yield* flush();
        return;
      }
      if (line.startsWith(':')) return;

      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      let value = colon === -1 ? '' : line.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1);

      if (field === 'event') {
        yield* flush();
        eventName = value.trim();
      } else if (field === 'data') {
        dataLines.push(value);
      }
    };

    while (true) {
      const {done, value} = await reader.read();
      if (done) {
        buffer += decoder.decode();
        break;
      }
      buffer += decoder.decode(value, {stream: true});
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        yield* readLine(line);
      }
    }
    if (buffer) {
      yield* readLine(buffer);
    }
    yield* flush();
  }

  // 对外暴露
  global.MYHS_API_CLIENT = Object.freeze({
    API_ERROR_KIND,
    ApiRequestError,
    fetchLunarData,
    runSSERequest,
  });
})(window);
