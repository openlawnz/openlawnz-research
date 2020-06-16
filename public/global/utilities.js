export const $ = (selector, context) => {
	const found = (context || document).querySelectorAll(selector);
	return found.length > 1 ? found : found[0];
};