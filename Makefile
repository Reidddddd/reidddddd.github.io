.PHONY: check

check:
	node --check api-client.js
	node --check cast-state.js
	node --check lunar-picker.js
	node --check hexagram-renderer.js
	node --check jie-gua-result.js
	node --check app.js
	node --check guestbook.js
	node --check tests/browser-tests.js
