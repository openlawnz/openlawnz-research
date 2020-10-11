const express = require('express');
const app = express();
const port = 8083;
const basicAuth = require('express-basic-auth');
const bodyParser = require('body-parser');

const MOCK_case_sets = require("./mocks/case-sets.json");
const MOCK_case_set = require("./mocks/case-sets/sample_case_set");
const MOCK_case = require("./mocks/cases/sample_case");
const MOCK_columns = require("./mocks/columns.json");
const MOCK_search_results = require("./mocks/search-results.json");

if (!process.env.USERS) {
	console.log('No users specified');
	return;
}

const users = JSON.parse(process.env.USERS);
const profiles = JSON.parse(process.env.PROFILES);

app.use(
	basicAuth({
		users,
		challenge: true,
	})
);

app.use(bodyParser.json());
app.set('view engine', 'ejs');
app.use(express.static('public'));

app.use('/human-refinement/',express.static('mocks/public'));

const adminOnly = (req, res, next) => {
	if (!req.auth.user || !isAdmin(req.auth.user)) {
		res.status(401).send('Unauthorized');
	} else {
		next();
	}
};

const isAdmin = (user) => {
	if (!profiles[user]) {
		return false;
	}
	return profiles[user].role === 'admin';
};

const adminOrUserOnly = (req, res, next) => {
	if (!req.auth.user || !isAdminOrUser(req.auth.user)) {
		res.status(401).send('Unauthorized');
	} else {
		next();
	}
};

const isAdminOrUser = (user) => {
	if (!profiles[user]) {
		return false;
	}
	return profiles[user].role === 'admin' || profiles[user].role === 'user';
}

/**
 * Home
 */

(() => {
	app.get('/', (req, res) => {
		res.render('index', {
			pageKey: 'Home',
			pageTitle: 'Home',
		});
	});

	app.get('/api/home/cases-total', async (req, res) => {
		res.json([{"count":"1"}]);
	});

	app.get('/api/home/random-case-sets', async (req, res) => {
		res.json([ { id: MOCK_case_sets[0].id } ]);
	});

})();

/**
 * Human Refinement
 */

(() => {

	app.get('/human-refinement', (req, res) => {
		res.render('human-refinement', {
			pageKey: 'human-refinement',
			pageTitle: 'Human Refinement',
			isAdmin: isAdmin(req.auth.user),
			isAdminOrUser: isAdminOrUser(req.auth.user)
		});
	});

	app.post('/api/human-refinement/case-sets', adminOnly, async (req, res) => {
		res.json({});
	});

	app.get('/api/human-refinement/case-sets', async (req, res) => {
		res.json(MOCK_case_sets);
	});

	app.get('/api/human-refinement/case-sets/:id', async (req, res) => {
		res.json(MOCK_case_set);
	});

	app.get('/api/human-refinement/cases/:caseId', async (req, res) => {
		res.json(MOCK_case);
	});

	app.post('/api/human-refinement/cases/:caseId', adminOrUserOnly, async (req, res) => {
		res.json({});
	});
})();

/**
 * Export API routes
 */

(() => {

	app.get('/export', (req, res) => {
		res.render('export', {
			pageKey: 'export',
			pageTitle: 'Export',
		});
	});

	app.get('/api/export/columns', async (req, res) => {
		res.json(MOCK_columns);
	});

	app.get('/api/export/search', async (req, res) => {
		res.json(MOCK_search_results)
	});
})();

app.listen(port, () => {
	console.log(`Server started on port ${port}`);
});
