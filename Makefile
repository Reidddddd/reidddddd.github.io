.PHONY: check

check:
	node --check api-client.js
	node --check cast-state.js
	node --check app.js
