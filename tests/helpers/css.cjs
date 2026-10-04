// 读取本项目的 CSS 声明，供静态回归对照；不模拟浏览器布局或完整层叠计算。
function normalizeValue(value) {
  return value.replace(/\s+/g, ' ').replace(/\s*([(),])\s*/g, '$1').trim();
}

function parseStyleRules(source) {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const tokens = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[{}]/g;
  const stack = [];
  const rules = [];
  let cursor = 0;
  for (const match of css.matchAll(tokens)) {
    if (match[0] === '{') {
      if (stack.length) stack.at(-1).hasChildren = true;
      stack.push({header: css.slice(cursor, match.index).trim(), start: match.index + 1});
      cursor = match.index + 1;
    } else if (match[0] === '}') {
      const block = stack.pop();
      if (!block) throw new Error('CSS 结束括号没有对应规则');
      if (!block.hasChildren && !block.header.startsWith('@') &&
          !stack.some(parent => parent.header.includes('keyframes'))) {
        const declarations = css.slice(block.start, match.index).split(';')
          .filter(value => value.trim()).map(value => {
            const colon = value.indexOf(':');
            if (colon < 0) throw new Error('CSS 声明缺少冒号');
            return [value.slice(0, colon).trim(), normalizeValue(value.slice(colon + 1))];
          });
        for (const selector of block.header.split(',')) {
          rules.push({
            selector: normalizeValue(selector),
            conditions: stack.map(parent => normalizeValue(parent.header)),
            declarations,
          });
        }
      }
      cursor = match.index + 1;
    }
  }
  if (stack.length) throw new Error('CSS 规则没有结束');
  return rules;
}

function declarationTable(source) {
  const rules = parseStyleRules(source);
  const variables = Object.fromEntries(rules.filter(rule => rule.selector === ':root')
    .flatMap(rule => rule.declarations));
  const table = new Map();
  for (const rule of rules) {
    const key = JSON.stringify([rule.conditions, rule.selector]);
    const declarations = table.get(key) || {};
    for (const [property, value] of rule.declarations) {
      declarations[property] = normalizeValue(value.replace(/var\((--[\w-]+)\)/g,
        (reference, name) => variables[name] || reference));
    }
    table.set(key, declarations);
  }
  return table;
}

module.exports = {normalizeValue, parseStyleRules, declarationTable};
