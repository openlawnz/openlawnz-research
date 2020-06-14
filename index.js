const express = require('express');
const app = express();
const port = process.env.PORT || 8082;
const basicAuth = require('express-basic-auth');
const bodyParser = require('body-parser');
const uuidv4 = require('uuid').v4;

if (!process.env.USERS) {
	console.log('No users specified');
	return;
}
app.use(
	basicAuth({
		users: JSON.parse(process.env.USERS),
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
app.use(express.static('public'));

app.get('/cases', async (req, res) => {
	const result = await client.query(`
    SELECT 
    main.cases.case_name,
    main.cases.id,
    (
      FLOOR ((
        SELECT COUNT(*)
        FROM funnel.facet_value_metadata
        WHERE main.cases.id = funnel.facet_value_metadata.case_id
      ) / (
        SELECT 
          COUNT(*) 
          FROM funnel.facets
      )) 
    ) AS processed_count
  FROM main.cases
  INNER JOIN main.category_to_cases ON main.cases.id = main.category_to_cases.case_id
  WHERE main.category_to_cases.category_id = 'acc'`);

	res.json(result.rows);
});

app.get('/cases/:caseId', async (req, res) => {
	const caseId = req.params.caseId;

	const underscore = caseId.split('_')[2];
	const accsplit = underscore.split('NZACC');

	const pdfURLID = accsplit[1].split('.pdf')[0] + '-' + accsplit[0] + '.pdf.json';

	const [allFacets, userValues] = await Promise.all([
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
          WHERE funnel.facet_value_metadata.facet_id = funnel.facets.id
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
      meta.facet_id AS facet_id,
      d.date_day AS date_day,
      d.date_month AS date_month,
      d.date_year AS date_year,
      d.not_applicable AS date_not_applicable
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
			pdfJSON: `${process.env.PDF_JSON_BASE_PATH}${pdfURLID}`,
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

app.post('/cases/:caseId', async (req, res) => {
	const caseId = req.params.caseId;
	const metadataId = uuidv4();
	try {
		await client.query('BEGIN');

		await client.query(
			`
        INSERT INTO funnel.facet_value_metadata
        (
          id, 
          facet_id, 
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
          not_applicable
        ) VALUES ($1, $2, $3, $4)`,
				[uuidv4(), metadataId, req.body.facetValue, req.body.not_applicable]
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
          not_applicable
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
				[
					uuidv4(),
					metadataId,
					req.body.facetValue[0] ? req.body.facetValue[0] : null,
					req.body.facetValue[1] ? req.body.facetValue[1] : null,
					req.body.facetValue[2] ? req.body.facetValue[2] : null,
					req.body.not_applicable,
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

app.listen(port, () => {
	console.log(`Server started on port ${port}`);
});
