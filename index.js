const express = require('express')
const app = express()
const port = 8082

app.use(express.static('public'))
/*
let sampleData = {
    "facets": [{
        "id": 1,
        "name": "Date of Injury",
        "value": "abc",
        "type": "date",
        "options": [{
            "text": "test abc test",
            "highlight": "abc"
        }, {
            "text": "test2 abc test",
            "highlight": "abc"
        }, {
            "text": "test3 abc test",
            "highlight": "abc"
        }]
    }, {
        "id": 2,
        "name": "Date2 of Injury 2",
        "value": null,
        "type": "date",
        "options": [{
            "text": "testgggg abc test",
            "highlight": "abc"
        }, {
            "text": "test2 abc test",
            "highlight": "abc"
        }]
    }]    
};
*/

let sampleData = {
  "facets": [
    {
      "id": 2,
      "name": "Has sufficient evidence",
      "value": null,
      "type": "boolean",
      "options": [
        {
          "id": 0,
          "text": "testgggg abc test",
          "highlight": "abc"
        },
        {
          "id": 1,
          "text": "test2 abc test",
          "highlight": "abc"
        }
      ]
    },
    {
      "id": 1,
      "name": "Date of Injury",
      "value": null,
      "type": "date",
      "options": [
        {
          "text": "test abc test",
          "highlight": "abc"
        },
        {
          "text": "test2 abc2 test",
          "highlight": "abc2"
        },
        {
          "text": "test3 abc3 test",
          "highlight": "abc3"
        }
      ]
    },
    {
      "id": 3,
      "name": "Has sufficient evidence",
      "value": null,
      "type": "boolean",
      "options": [
        {
          "text": "testgggg abc test",
          "highlight": "abc"
        },
        {
          "text": "test2 abc test",
          "highlight": "abc"
        }
      ]
    }
  ]
}


app.get('/case', (req, res) => res.json(sampleData))

app.patch('/save-facet', (req, res) => res.json(sampleData))

app.listen(port, () => console.log(`Example app listening on port ${port}!`))