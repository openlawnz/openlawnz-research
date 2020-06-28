const express = require('express');
const app = express();
const port = process.env.PORT || 8082;
const basicAuth = require('express-basic-auth');
const bodyParser = require('body-parser');
const uuidv4 = require('uuid').v4;
const { Parser } = require('json2csv');
const ejs = require('ejs');

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

const { Client } = require('pg');

const client = new Client({
	user: process.env.DB_USER,
	host: process.env.DB_HOST,
	database: process.env.DB_NAME,
	password: process.env.DB_PASSWORD,
	port: process.env.DB_PORT,
});
client.connect();

app.use(bodyParser.json());
app.set('view engine', 'ejs');
app.use(express.static('public'));

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
		const result = await client.query(`
		SELECT COUNT(*) from main.category_to_cases where category_id = 'acc'`);
		res.json(result.rows);
	});

	app.get('/api/home/random-case-sets', async (req, res) => {
		const result = await client.query(`
		SELECT id
		FROM funnel.random_case_sets
		ORDER BY random()
		LIMIT 1`);
		res.json(result.rows);
	});

})();

/**
 * Human Refinement
 */

(() => {
	// https://stackoverflow.com/a/12646864
	const shuffleArray = (array) => {
		for (let i = array.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[array[i], array[j]] = [array[j], array[i]];
		}
	};

	app.get('/human-refinement', (req, res) => {
		res.render('human-refinement', {
			pageKey: 'human-refinement',
			pageTitle: 'Human Refinement',
			isAdmin: isAdmin(req.auth.user),
		});
	});

	app.post('/api/human-refinement/case-sets', adminOnly, async (req, res) => {
		if (!req.body.setSize) {
			throw new Error('Missing set size');
		}

		const setSize = parseInt(req.body.setSize);

		const result = await client.query(`
			SELECT 
			main.cases.id,
			main.cases.case_name
			FROM main.cases
			INNER JOIN main.category_to_cases ON main.cases.id = main.category_to_cases.case_id
			WHERE main.category_to_cases.category_id = 'acc'
		`);

		let shuffledRows = result.rows.slice(0);
		shuffleArray(shuffledRows);

		const sets = [];
		let currentSet = [];

		for (let i = 0; i < shuffledRows.length; i++) {
			if (i > 1 && i % setSize === 0) {
				sets.push(currentSet);
				currentSet = [];
			}
			currentSet.push(shuffledRows[i]);
		}

		if (currentSet.length > 0) {
			sets.push(currentSet);
		}

		try {
			await client.query('BEGIN');

			await client.query(`
		TRUNCATE
		funnel.random_case_sets`);

			await Promise.all(
				sets.map((s) =>
					client.query(
						`
				INSERT INTO
				funnel.random_case_sets
				(id, case_set)
				VALUES ($1, $2)`,
						[uuidv4(), JSON.stringify(s)]
					)
				)
			);

			await client.query('COMMIT');
		} catch (ex) {
			await client.query('ROLLBACK');
			console.log(ex);
		}

		res.json({});
	});

	app.get('/api/human-refinement/case-sets', async (req, res) => {
		const result = await client.query(`
		SELECT id FROM funnel.random_case_sets`);
		res.json(result.rows);
	});

	app.get('/api/human-refinement/case-sets/:id', async (req, res) => {
		const result = await client.query(
			`
		SELECT * FROM funnel.random_case_sets WHERE id=$1`,
			[req.params.id]
		);
		res.json(result.rows);
	});

	app.get('/api/human-refinement/cases/:caseId', async (req, res) => {
		const caseId = req.params.caseId;

		const [caseData, allFacets, userValues] = await Promise.all([
			client.query(
				`
				SELECT id, case_name 
				FROM main.cases 
				WHERE id = $1
			`,
				[caseId]
			),
			client.query(
				`
		  SELECT 
			funnel.facets.id AS facet_id, 
			funnel.facets.type, 
			funnel.facets.description,
			funnel.facets.name,
			funnel.facet_boolean_keywords.id AS option_id,
			funnel.facet_boolean_keywords.whole_word,
			funnel.facet_boolean_keywords.value,
			(
			  SELECT COUNT(*) FROM 
			  funnel.facet_value_metadata
			  WHERE funnel.facet_value_metadata.ugc_id = funnel.facets.id
			  AND funnel.facet_value_metadata.case_id = $1
			) AS completed_count
		  FROM funnel.facets
		  LEFT JOIN funnel.facet_boolean_keywords 
		  ON funnel.facets.id = funnel.facet_boolean_keywords.facet_id`,
				[caseId]
			),

			client.query(
				`
		  SELECT 
		  b.value AS boolean_value, 
		  b.not_applicable AS boolean_not_applicable, 
		  b.unsure AS boolean_unsure, 
		  meta.ugc_id AS facet_id,
		  d.date_day AS date_day,
		  d.date_month AS date_month,
		  d.date_year AS date_year,
		  d.not_applicable AS date_not_applicable,
		  d.unsure AS date_unsure
		  FROM funnel.facet_value_metadata AS meta
		  LEFT JOIN funnel.boolean_facet_values AS b
			ON b.metadata_id = meta.id
		  LEFT JOIN funnel.date_facet_values AS d
			ON d.metadata_id = meta.id
		  WHERE meta.case_id = $1
		  AND meta.user_id = $2
		  ORDER BY meta.date_recorded DESC`,
				[caseId, req.auth.user]
			),
		]);

		let response = {
			caseMeta: {
				id: caseId,
				caseName: caseData.rows[0].case_name,
				pdfJSON: `${process.env.PDF_JSON_BASE_PATH}${caseId}`,
				pdfURL: `${process.env.PDF_BASE_PATH}${caseId}`,
			},
		};

		let facets = {};

		allFacets.rows.forEach((r) => {
			if (!facets[r.facet_id]) {
				let value = null;
				let userValueResult = userValues.rows.find((f) => f.facet_id == r.facet_id);
				if (userValueResult) {
					value =
						r.type === 'boolean'
							? userValueResult.boolean_value
							: userValueResult.date_day || userValueResult.date_month || userValueResult.date_year
							? [userValueResult.date_day, userValueResult.date_month, userValueResult.date_year]
							: null;
				}

				facets[r.facet_id] = {
					id: r.facet_id,
					name: r.name,
					type: r.type,
					completedCount: r.completed_count,
					value,
					not_applicable: userValueResult
						? r.type === 'boolean'
							? userValueResult.boolean_not_applicable
							: userValueResult.date_not_applicable
						: null,
					unsure: userValueResult
						? r.type === 'boolean'
							? userValueResult.boolean_unsure
							: userValueResult.date_unsure
						: null,
					...(r.type === 'boolean'
						? {
								description: r.description,
								options: [],
						  }
						: null),
				};
			}

			if (r.type === 'boolean') {
				facets[r.facet_id].options.push({
					id: r.id,
					value: r.value,
					wholeWord: r.whole_word,
				});
			}
		});

		response.facets = Object.values(facets);

		res.json(response);
	});

	app.post('/api/human-refinement/cases/:caseId', async (req, res) => {
		const caseId = req.params.caseId;
		const metadataId = uuidv4();
		try {
			await client.query('BEGIN');

			await client.query(
				`
			INSERT INTO funnel.facet_value_metadata
			(
			  id, 
			  ugc_id, 
			  user_id, 
			  date_recorded, 
			  case_id
			) VALUES ($1, $2, $3, $4, $5)`,
				[metadataId, req.body.facetId, req.auth.user, new Date().toISOString(), caseId]
			);

			if (req.body.type == 'boolean') {
				await client.query(
					`
			INSERT INTO funnel.boolean_facet_values
			(
			  id, 
			  metadata_id, 
			  value,
			  not_applicable,
			  unsure
			) VALUES ($1, $2, $3, $4, $5)`,
					[uuidv4(), metadataId, req.body.facetValue, req.body.not_applicable, req.body.unsure]
				);
			} else if (req.body.type == 'date') {
				await client.query(
					`
			INSERT INTO funnel.date_facet_values
			(
			  id, 
			  metadata_id, 
			  date_day,
			  date_month,
			  date_year,
			  not_applicable,
			  unsure
			) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
					[
						uuidv4(),
						metadataId,
						// Tidy
						req.body.facetValue && req.body.facetValue[0] ? req.body.facetValue[0] : null,
						req.body.facetValue && req.body.facetValue[1] ? req.body.facetValue[1] : null,
						req.body.facetValue && req.body.facetValue[2] ? req.body.facetValue[2] : null,
						req.body.not_applicable,
						req.body.unsure,
					]
				);
			} else {
				throw new Error('Invalid type');
			}

			await client.query('COMMIT');
		} catch (ex) {
			await client.query('ROLLBACK');
			console.log(ex);
		}

		res.json({});
	});
})();

/**
 * Export API routes
 */

(() => {
	const legislationQuery = `(

		SELECT json_agg(item) as legislation FROM
		(
			SELECT DISTINCT
				main.legislation.title, 
				main.legislation_to_cases.section
			FROM main.legislation
			INNER JOIN main.legislation_to_cases ON main.legislation.id = main.legislation_to_cases.legislation_id
			WHERE main.legislation_to_cases.case_id = m.id
		) as item
	)`;

	const judgeQuery = `(
			SELECT DISTINCT main.judge_to_cases.name
			FROM  main.judge_to_cases
			WHERE main.judge_to_cases.case_id = m.id
	) AS judge`;

	const citationQuery = `(
		ARRAY(
			SELECT DISTINCT main.case_citations.citation
			FROM  main.case_citations
			WHERE main.case_citations.case_id = m.id
		)
	) AS citation`;

	const casesCitedQuery = `(
		ARRAY(
				SELECT main.cases.case_name
				FROM main.cases_cited
				INNER JOIN main.cases ON main.cases.id = main.cases_cited.case_cited
				WHERE main.cases_cited.case_origin = m.id
		)
	) AS cases_cited`;

	const courtsQuery = `(
		SELECT main.courts.name
		FROM  main.courts
		WHERE m.court_id = main.courts.id
	) AS court`;

	const accColumn = (facetId, colName, facetName) => `
		LEFT JOIN LATERAL (
		SELECT
			json_agg(item) as ${colName}
			FROM (
				SELECT 
					funnel.facet_value_metadata.user_id,
					funnel.facet_value_metadata.date_recorded,
					funnel.boolean_facet_values.value as boolean_value,
					funnel.boolean_facet_values.not_applicable as boolean_not_applicable,
					funnel.boolean_facet_values.unsure as boolean_unsure,
					funnel.date_facet_values.date_day as date_day,
					funnel.date_facet_values.date_month as date_month,
					funnel.date_facet_values.date_year as date_year,
					funnel.date_facet_values.not_applicable as date_not_applicable,
					funnel.date_facet_values.unsure as date_unsure
				FROM funnel.facet_value_metadata 
				INNER JOIN funnel.facets ON funnel.facets.id = funnel.facet_value_metadata.ugc_id
				LEFT JOIN funnel.boolean_facet_values 
					ON funnel.boolean_facet_values.metadata_id = funnel.facet_value_metadata.id
				LEFT JOIN funnel.date_facet_values 
					ON funnel.date_facet_values.metadata_id = funnel.facet_value_metadata.id
				WHERE funnel.facet_value_metadata.case_id = ol.id
				AND funnel.facet_value_metadata.ugc_id = '${facetId}'
				
			) as item
		) as ${colName} ON true

		LEFT JOIN LATERAL(
			SELECT funnel.facets.name as ${facetName}
			FROM funnel.facets
			WHERE funnel.facets.id = '${facetId}'
		) as ${facetName} ON true`;

	const keywordExists = (keywords) => {
		const reg = keywords.replace(/\s+/g, '\\s').replace(/"/g, '""').replace(/'/g, "''");
		const exists = keywords.replace(/\s+/g, '_').replace(/"/g, '[quote]').replace(/'/g, '[quote]');
		return `(
			SELECT 
			CASE WHEN (
				SELECT regexp_matches(case_text, '\\m${reg}.*$', 'i'))[1] IS NULL 
				THEN FALSE 
				ELSE TRUE 
			END
		) AS "${exists}_exists"`;
	};

	app.get('/export', (req, res) => {
		res.render('export', {
			pageKey: 'export',
			pageTitle: 'Export',
		});
	});

	app.get('/api/export/columns', async (req, res) => {
		const result = await client.query(`
			SELECT DISTINCT funnel.facets.id, funnel.facets.name
			FROM funnel.facets
			WHERE (
				SELECT COUNT(*)
				FROM funnel.facet_value_metadata
				WHERE funnel.facets.id = funnel.facet_value_metadata.ugc_id
			) > 0
			
		`);

		res.json(result.rows);
	});

	app.get('/api/export/search', async (req, res) => {
		let s = ['id'];
		let lateralJoins = [];

		if (req.query.fixedColumns) {
			req.query.fixedColumns.split(',').forEach((f) => {
				switch (f) {
					case 'name':
						s.push('case_name');
						break;

					case 'date':
						s.push('case_date');
						break;

					case 'citation':
						s.push(citationQuery);
						break;

					case 'court':
						s.push(courtsQuery);
						break;

					case 'cases-cited':
						s.push(casesCitedQuery);
						break;

					case 'legislation-referenced':
						s.push(legislationQuery);
						break;

					case 'judge':
						s.push(judgeQuery);
						break;
				}
			});
		}

		if (req.query.keywordsFields) {
			req.query.keywordsFields.split(',').forEach((k) => {
				s.push(keywordExists(k));
			});
		}

		if (req.query.ugcColumns) {
			req.query.ugcColumns.split(',').forEach((r, i) => {
				const accCol = `_accCol_value_${i}`;
				const accColValue = `_accCol_name_${i}`;
				lateralJoins.push({
					accCol,
					accColValue,
					sql: accColumn(r, accCol, accColValue),
				});
			});
		}

		let dateRangeValues = [];
		let whereConditions = [];

		if (req.query.startDate) {
			dateRangeValues.push(req.query.startDate);
			whereConditions.push('m.case_date >= $1');
		}
		if (req.query.endDate) {
			dateRangeValues.push(req.query.endDate);
			whereConditions.push('m.case_date < $2');
		}

		if(req.query.caseSetId) {
			const case_set = await client.query(`SELECT * FROM funnel.random_case_sets WHERE id = $1`, [req.query.caseSetId])
			whereConditions.push(`m.id IN ('${case_set.rows[0].case_set.map(c => c.id).join('\',\'')}')`);
		}

		let q = `
		SELECT * FROM (
			SELECT
				${s.join(',')}
			FROM main.cases as m
			${whereConditions.length > 0 ? "WHERE " + whereConditions.join(" AND ") : ""}
				
		) as ol ${lateralJoins.map((l) => l.sql).join('\n')}`;

		if (req.query.preview) {
			q += ' LIMIT 100';
		}
		let a;
		if (dateRangeValues.length === 0) {
			a = await client.query(q);
		} else {
			a = await client.query(q, dateRangeValues);
		}

		let columns = [];
		let rows = [];

		if (a.rows.length > 0) {
			// Get columns
			const columnSample = a.rows[0];

			Object.keys(columnSample).forEach((k) => {
				if (k.startsWith('_acc')) {
					if (k.indexOf('_value') == -1) {
						const col = columnSample[k.replace(/value/, /name/)];
						const colName = col.toLowerCase().replace(/\s+/g, '_');
						columns.push(colName);
						columns.push(colName + '_consensus');
					}
				} else {
					columns.push(k);
				}
			});

			a.rows.forEach((r) => {
				const keys = Object.keys(r).filter((r) => !r.startsWith('_acccol_name'));
				const kMap = keys.reduce((arr, k) => {
					if (k.startsWith('_acccol_value')) {
						if (r[k] !== null) {
							const ret = r[k]
								.map((json) => {
									let ret = {
										user_id: json.user_id,
										date_recorded: json.date_recorded,
									};

									if (json.boolean_unsure) {
										ret.value = 'Unsure';
									} else if (json.date_unsure) {
										ret.value = 'Unsure';
									} else if (json.boolean_not_applicable) {
										ret.value = 'Not Applicable';
									} else if (json.date_not_applicable) {
										ret.value = 'Not Applicable';
									} else if (json.boolean_value !== null) {
										ret.value = json.boolean_value;
									} else {
										const date_return = [];
										if (json.date_day) {
											date_return.push(json.date_day);
										}
										date_return.push(json.date_month);
										date_return.push(json.date_year);
										ret.value = date_return.join('-');
									}
									return ret;
								})
								.sort(function (a, b) {
									return b.date_recorded < a.date_recorded ? -1 : b.date_recorded > a.date_recorded ? 1 : 0;
								});

							// There is likely a better way to write this
							let userValues = {};

							ret.forEach((r) => {
								if (!userValues[r.user_id]) {
									userValues[r.user_id] = r.value;
								}
							});

							const userValuesArray = Object.values(userValues);

							let consensus = true;
							let currentValue = userValuesArray[0];
							for (let y = 1; y < userValuesArray.length; y++) {
								if (userValuesArray[y] !== currentValue) {
									consensus = false;
									break;
								}
							}

							arr.push(ret);
							arr.push(consensus);
						} else {
							arr.push(null);
							arr.push(null);
						}
					} else {
						arr.push(r[k]);
					}

					return arr;
				}, []);

				rows.push(kMap);
			});
		}

		if (!req.query.exportData) {
			res.json({
				total: rows.length,
				columns,
				rows,
			});
		} else if (req.query.exportData) {
			const jsonData = [];

			rows.forEach((r) => {
				let ret = {};
				r.forEach((k, i) => {
					ret[columns[i]] = k;
				});
				jsonData.push(ret);
			});

			if (req.query.exportData === 'csv') {
				const fields = columns;
				const opts = { fields };

				try {
					const parser = new Parser(opts);
					const csv = parser.parse(jsonData);

					res.setHeader('Content-Type', 'text/csv');
					res.setHeader('Content-Disposition', 'attachment; filename="' + 'download-' + Date.now() + '.csv"');

					res.send(csv);
				} catch (err) {
					console.error(err);
				}
			} else if (req.query.exportData === 'json') {
				res.setHeader('Content-Type', 'application/json');
				res.setHeader('Content-Disposition', 'attachment; filename="' + 'download-' + Date.now() + '.json"');

				res.send(jsonData);
			}
		}
	});
})();

app.listen(port, () => {
	console.log(`Server started on port ${port}`);
});
