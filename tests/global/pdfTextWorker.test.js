const { wordSearch, booleanSearch } = require('../../public/global/pdfTextWorker');
const caseData = require('../caseData.json');

const convertBoundingBoxSize = (boundingBox) => boundingBox.map((b) => b * 72);

describe('pdfTextWorker', () => {
	describe('booleanSearch', () => {
		it('Should find bounding boxes for all instances of the word: district court', () => {
			const words = [
				{
					value: 'district court',
					wholeWord: true,
				},
			];

			const expected = [
				[
					{
						boxes: [
							convertBoundingBoxSize(caseData[0].lines[0].words[2].boundingBox), // district
							convertBoundingBoxSize(caseData[0].lines[0].words[3].boundingBox), // court
						],
					},
				],
				[],
				[],
			];
			expect(booleanSearch(caseData, words)).toEqual(expected);
		});

		it('Should find bounding boxes for all instances of the word: and (matching the whole word)', () => {
			const words = [
				{
					value: 'and',
					wholeWord: true,
				},
			];
			const expected = [
				[
					{
						boxes: [convertBoundingBoxSize(caseData[0].lines[4].words[4].boundingBox)], // and
					},
				],
				[
					{
						boxes: [convertBoundingBoxSize(caseData[1].lines[1].words[2].boundingBox)], // and
					},
				],
				[
					{
						boxes: [convertBoundingBoxSize(caseData[2].lines[5].words[7].boundingBox)], // and
					},
				],
			];
			expect(booleanSearch(caseData, words)).toEqual(expected);
		});

		it('Should find no bounding boxes matching the word: strict court (matching the whole word)', () => {
			const words = [
				{
					value: 'strict court',
					wholeWord: true,
				},
			];
			const expected = [[], [], []];
			expect(booleanSearch(caseData, words)).toEqual(expected);
		});

		it('Should find no bounding boxes matching the word: the district cour (matching the whole word)', () => {
			const words = [
				{
					value: 'the district cour',
					wholeWord: true,
				},
			];
			const expected = [[], [], []];
			expect(booleanSearch(caseData, words)).toEqual(expected);
		});

		it('Should find no bounding boxes for word: blah', () => {
			const words = [
				{
					value: 'blah',
					wholeWord: true,
				},
			];

			const expected = [[], [], []];
			expect(booleanSearch(caseData, words)).toEqual(expected);
		});
	});

	describe('wordSearch', () => {
		it('Should find bounding boxes for all instances of the word: district court', () => {
			const words = 'district court';
			const expected = [
				[
					{
						boxes: [
							convertBoundingBoxSize(caseData[0].lines[0].words[2].boundingBox), // district
							convertBoundingBoxSize(caseData[0].lines[0].words[3].boundingBox), // court
						],
					},
				],
				[],
				[],
			];
			expect(wordSearch(caseData, words)).toEqual(expected);
		});

		it('Should find bounding boxes for all instances of the word: and', () => {
			const word = 'and';
			const expected = [
				[
					{
						boxes: [convertBoundingBoxSize(caseData[0].lines[4].words[4].boundingBox)], // and
					},
				],
				[
					{
						boxes: [
							convertBoundingBoxSize(caseData[1].lines[1].words[2].boundingBox), // and
						],
					},
					{
						boxes: [
							convertBoundingBoxSize(caseData[1].lines[1].words[3].boundingBox), // Anderson
						],
					},
				],
				[
					{
						boxes: [convertBoundingBoxSize(caseData[2].lines[5].words[7].boundingBox)], // and
					},
				],
			];
			expect(wordSearch(caseData, word)).toEqual(expected);
		});

		it('Should find no bounding boxes for word: blah', () => {
			const word = 'blah';
			const expected = [[], [], []];
			expect(wordSearch(caseData, word)).toEqual(expected);
		});
	});
});
