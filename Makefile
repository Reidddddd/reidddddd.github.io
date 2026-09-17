.PHONY: check

check:
	node --check api-client.js
	node --check cast-state.js
	node --check lunar-picker.js
	node --check app.js
