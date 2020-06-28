/*
This project is deliberately vanilla javascript.
Things could be abstracted and made reusable.
*/

const $ = (selector, context) => {
	const found = (context || document).querySelectorAll(selector);
	return found.length > 1 ? found : found[0];
};

let $accCasesTotal;
let $accCasesProcessed;
let $accGetStarted;
let $accDialog;
let $acceptButton;
let $closeDialog;

window.onload = async () => {
	$accCasesTotal = $('#accCasesTotal');
	$accCasesProcessed = $('#accCasesProcessed');
	$accGetStarted = $('#accGetStarted');
	$accDialog = $('#accDialog');
	$acceptButton = $('.acceptButton');
	$closeDialog = $('.closeDialog');

	const [{ count }] = await fetch('/api/home/cases-total').then((c) => c.json());

	$accCasesTotal.innerText = count;
	$accCasesProcessed.innerText = '0';

	$accGetStarted.onclick = () => {
		$accDialog.showModal();
	};

	$closeDialog.onclick = () => {
		$accDialog.close();
	};

	$acceptButton.onclick = async () => {
		const [{ id }] = await fetch('/api/home/random-case-sets').then((c) => c.json());
		window.location.href = `/human-refinement/?caseSetId=${id}`;
	};

	$('#wrap.loading').classList.remove('loading');
};
