const dateRegex = /(((((31)?(?!\s+(Feb(ruary)?|Apr(il)?|June?|(Sep(?=\b|t)t?|Nov)(ember)?)))|((30|29)?(?!\s+Feb(ruary)?))|((29)?(?=\s+Feb(ruary)?\s+(((1[6-9]|[2-9]\d)(0[48]|[2468][048]|[13579][26])|((16|[2468][048]|[3579][26])00)))))|(0?[1-9])|1\d|2[0-8])\s+(Jan(uary)?|Feb(ruary)?|Ma(r(ch)?|y)|Apr(il)?|Ju((ly?)|(ne?))|Aug(ust)?|Oct(ober)?|(Sep(?=\b|t)t?|Nov|Dec)(ember)?),?\s+((1[6-9]|[2-9]\d)\d{2}))|(\s(\d{1,2}(\s+)?(st|nd|rd|th)?)\s+(?:day\s+of)?(?:of)?(\s+)?(\w*)(\s+)?(\d{4})))/gim;

const wordSearch = (caseData, query, shouldMatchWholeWord = false) => {
	const boundingBoxes = [];
	const _query = query.replace(/\s\s+/g, ' ').toLowerCase().trim();
	const matcher = RegExp(`\\b(\\w*${_query}\\w*)\\b`, 'g');

	caseData.forEach((page) => {
		const currentPage = [];
		const wordsOnPage = page.lines
			.map((line) =>
				line.words.map((word) => {
					const { text, ...boundingBoxInfo } = word;
					return {
						text: text
							.toLowerCase()
							.replace(/[^\w\s]|_/g, '')
							.trim(),
						...boundingBoxInfo,
					};
				})
			)
			.flat();

		const pageContent = wordsOnPage.reduceRight((content, word) => `${word.text} ${content}`, '').trim();
		const wordMatches = pageContent.match(matcher);
		const _wordMatches = wordMatches && wordMatches.map((wordMatch) => wordMatch.split(' '));

		if (!_wordMatches) {
			boundingBoxes.push(currentPage);
			return;
		}

		let matchedWordIndex = 0;
		for (let word = 0; word < wordsOnPage.length; word++) {
			const { text, boundingBox } = wordsOnPage[word];
			const matchedWords = _wordMatches[matchedWordIndex];

			if (!matchedWords) {
				break;
			}

			const matchesWholeWord = shouldMatchWholeWord ? text === _query : true;

			// Multiple word matching
			if (matchedWords.length > 1 && text === matchedWords[0]) {
				let multipleWordBoxes = [];
				for (let multipleWordIndex = 0; multipleWordIndex < matchedWords.length; multipleWordIndex++) {
					const { text: nextWordText, boundingBox: nextWordBoundingBox } = wordsOnPage[word + multipleWordIndex];
					if (nextWordText !== matchedWords[multipleWordIndex]) {
						multipleWordBoxes = [];
						break;
					}
					multipleWordBoxes.push(nextWordBoundingBox.map((b) => b * 72));
				}
				multipleWordBoxes.length > 0 && currentPage.push({ boxes: multipleWordBoxes });
				multipleWordBoxes.length > 0 && matchedWordIndex++;
			}

			// Single word matching
			if (matchedWords.length === 1 && text === matchedWords[0] && matchesWholeWord) {
				currentPage.push({ boxes: [boundingBox.map((b) => b * 72)] });
				matchedWordIndex++;
			}
		}

		boundingBoxes.push(currentPage);
	});

	return boundingBoxes;
};

const transposeArray = (array) => array[0].map((_, colIndex) => array.map((row) => row[colIndex]));
const booleanSearch = (caseData, words) => {
	const pageBoundingBoxesByWord = words.map(({ value, wholeWord }) => wordSearch(caseData, value, wholeWord));
	return transposeArray(pageBoundingBoxesByWord).map((boundingBoxes) => boundingBoxes.flat());
};

const dateSearch = (caseData) => {
	const allPagesBoundingBoxes = [];

	caseData.forEach((c) => {
		let currentPage = [];

		let caseText = '';
		for (let lineIndex in c.lines) {
			const line = c.lines[lineIndex];
			caseText += line.text + '\n';
		}

		let arrayMatches = [...caseText.matchAll(dateRegex)].map((a) => a[0]);

		let allWords = [];

		c.lines.forEach((l) => {
			allWords = allWords.concat(l.words);
		});

		arrayMatches.forEach((aM) => {
			let found = false;

			let amArr = aM.split(/\s+/).filter((f) => f !== '');
			let len = allWords.length;

			let currentSearchIndex = 0;
			let composition = [];
			let compositionWords = [];

			for (let i = 0; i < len; i++) {
				const word = allWords.shift();
				const wordText = word.text;
				let searchAhead = true;

				if (wordText.toLowerCase().includes(amArr[currentSearchIndex].toLowerCase())) {
					composition.push(amArr[currentSearchIndex]);
					compositionWords.push(word);

					while (searchAhead) {
						currentSearchIndex++;

						if (allWords[currentSearchIndex - 1].text.toLowerCase().includes(amArr[currentSearchIndex].toLowerCase())) {
							composition.push(amArr[currentSearchIndex]);
							compositionWords.push(allWords[currentSearchIndex - 1]);
							if (composition.join('_') == amArr.join('_')) {
								currentPage.push({
									optionValue: aM,
									boxes: compositionWords.map((w) => w.boundingBox.map((b) => b * 72)),
								});

								found = true;
								searchAhead = false;
							}
						} else {
							currentSearchIndex = 0;
							composition = [];
							compositionWords = [];
							searchAhead = false;
						}
					}
				}

				if (found) {
					break;
				}
			}
		});

		allPagesBoundingBoxes.push(currentPage);
	});

	return allPagesBoundingBoxes;
};

onmessage = function (e) {
	const { facetData, caseData } = JSON.parse(e.data);
	const { id, type, searchQuery, options: words } = facetData;

	const searchBoundingBoxes = type === 'search' && searchQuery.length > 0 && wordSearch(caseData, searchQuery);
	const booleanBoundingBoxes = type === 'boolean' && booleanSearch(caseData, words);
	const dateBoundingBoxes = type === 'date' && dateSearch(caseData);
	const boundingBoxes = searchBoundingBoxes || booleanBoundingBoxes || dateBoundingBoxes;

	boundingBoxes &&
		postMessage({
			id,
			boundingBoxes,
		});
};

// For unit testing
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
	module.exports.wordSearch = wordSearch;
	module.exports.booleanSearch = booleanSearch;
	module.exports.dateSearch = dateSearch;
}
