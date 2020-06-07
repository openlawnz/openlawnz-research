onmessage = function (e) {

  const dateRegex = /(((31(?!\ (Feb(ruary)?|Apr(il)?|June?|(Sep(?=\b|t)t?|Nov)(ember)?)))|((30|29)(?!\ Feb(ruary)?))|(29(?=\ Feb(ruary)?\ (((1[6-9]|[2-9]\d)(0[48]|[2468][048]|[13579][26])|((16|[2468][048]|[3579][26])00)))))|(0?[1-9])|1\d|2[0-8])\ (Jan(uary)?|Feb(ruary)?|Ma(r(ch)?|y)|Apr(il)?|Ju((ly?)|(ne?))|Aug(ust)?|Oct(ober)?|(Sep(?=\b|t)t?|Nov|Dec)(ember)?),?\s((1[6-9]|[2-9]\d)\d{2}))/gmi;

  const textExists = (text, findText) => {
    return text.toLowerCase().indexOf(findText.toLowerCase()) !== -1;
  };

  const isDate = (word) => {
    return new Date(word) !== "Invalid Date" && !isNaN(new Date(word));
  };

  const { facetData, caseData } = JSON.parse(e.data);

  const boundingBoxes = [];

  caseData.forEach((c) => {
    const currentPage = [];

    if (facetData.type === "boolean") {
      c.lines.forEach((l) => {
        // Find if it exists in the line text
        // If it does, look in the words

        facetData.options.forEach((f) => {
          if (textExists(l.text, f.value)) {
            l.words.forEach((w) => {
              if (textExists(w.text, f.value)) {
                currentPage.push({
                  boxes: w.boundingBox.map((b) => b * 72)
                });
              }
            });
          }
        });
      });
    } else if (facetData.type === "date") {
      
      let caseText = "";
      for (let lineIndex in c.lines) {
        const line = c.lines[lineIndex];
        caseText += line.text + "\n";
      }

      let arrayMatches = [...caseText.matchAll(dateRegex)].map(a => a[0]);

      arrayMatches.forEach(aM => {

        let found = false;
        let currentSearchIndex = 0;
        let composition = [];
        let compositionWords = [];

        let amArr = aM.split(/\s+/);
        for (let lineIndex in c.lines) {
          const l = c.lines[lineIndex];
          
          for(let wIndex in l.words) {
            const w = l.words[wIndex].text;
            if(w.toLowerCase() == amArr[currentSearchIndex].toLowerCase()) {
              composition.push(amArr[currentSearchIndex]);
              compositionWords.push(l.words[wIndex]);
              currentSearchIndex++;
              if(composition.join("_") == amArr.join("_")) {
                found = true;
                break;
              }
            } else {
              currentSearchIndex = 0;
              composition = [];
              compositionWords = [];
            }

          };

          if(found) {
            break;
          }

        }

        compositionWords.forEach(w => {
          currentPage.push({
            optionValue: aM,
            boxes: w.boundingBox.map((b) => b * 72)
          });
        })

      });

    } else {
      throw new Error("Unknown facet type");
    }

    boundingBoxes.push(currentPage);
  });

  postMessage({
    id: facetData.id,
    boundingBoxes,
  });
};
