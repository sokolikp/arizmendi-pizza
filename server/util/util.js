const JSSoup = require('jssoup').default;

const dates = {
  0: 'Wednesday',
  1: 'Thursday',
  2: 'Friday',
  3: 'Saturday',
  4: 'Sunday',
  5: 'Monday'
};

const months = new Set([
  "January", "February", "March", "April",
  "May", "June", "July", "August", "September",
  "October", "November", "December"]);

function validateDateStr (dateStr, dateIdx) {
  let validatedDateStr = "";
  let cleanedDateStr = dateStr.replace(",", "");
  let dateParts = cleanedDateStr.split(" ");
  let day = dateParts[0];
  let month = dateParts[1];
  let dayNumber = Number(dateParts[2]);
  let year = Number(dateParts[3]);
  if (day !== dates[dateIdx]) {
    console.log("Day string was incorrect; replacing with ", dates[dateIdx]);
    validatedDateStr += dates[dateIdx];
  } else {
    validatedDateStr += day + " ";
  }

  if (!months.has(month)) {
    console.log("Month is not valid:", month);
    return null;
  } else {
    validatedDateStr += month + " ";
  }

  if (dayNumber < 1 || dayNumber > 31) {
    console.log("dayNumber is not a valid dayNumber:", dayNumber);
    return null;
  } else {
    validatedDateStr += dayNumber + ", ";
  }

  if (year < 2019) {
    console.log("year is not a valid year:", year);
    return null;
  } else {
    validatedDateStr += year;
  }

  return validatedDateStr;
}

const util = {
  parseHtml (htmlStr, targetDateStr) {
    const soup = new JSSoup(htmlStr);
    let pTags = soup.findAll('p', attrs={'style': 'white-space:pre-wrap;'});
    // this parser assumes 12 p tags;
    // if there are not 12, something has changed with the website
    // and the parser should throw an error
    if (pTags.length !== 12) {
      return null;
    }

    // remove the last pTag; it's an empty spacer
    // pTags.pop();
    let res = [];
    for (let i = 0; i < pTags.length; i += 2) {
      let dateStr = pTags[i].getText();
      dateStr = validateDateStr(dateStr, i / 2);
      res.push({
        'date': dateStr,
        'pizza': pTags[i + 1].getText()
      });
    }

    // make sure all the pizzas are there
    if (res.length !== 6) {
      console.log("Could not validate a pizza for each day");
    }

    // make sure dates look approximately correct
    return res;
  },

  getIngredientStrs(ingredientsOrIngredientStatistics, key) {
    let ingredientStrs = new Set();
    ingredientsOrIngredientStatistics.forEach(ingredientOrIngredientStatistic => {
      ingredientStrs.add(ingredientOrIngredientStatistic[key]);
    });
    return Array.from(ingredientStrs);
  }
};

module.exports = util;
