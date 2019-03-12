const util = {
  parseHtml (htmlStr, startDateStr, endDateStr) {
    // get the target <p> node wrapper
    let startIdx = htmlStr.indexOf(startDateStr);
    let endIdx = htmlStr.indexOf(endDateStr);
    // if we can't find the start date ("today's" date),
    // the client sent us bad data.
    if (startIdx === -1) {
      console.log("Could not find start date");
      // return res.sendStatus(400);
      return { targetSubstr: null, error: 400 };
    } else if (endIdx === -1 && endDateStr.split(" ")[0] === "Tuesday") {
      // if we can't find the end date string, check if 'tomorrow' is Tuesday (the end of the menu).
      // In this case, set endIdx to the end of the htmlStr string.
      endIdx = htmlStr.length;
    } else if (endIdx === -1) {
      console.log("Could not find end date");
      // if we still can't find the end date, there's something wrong
      // return res.sendStatus(400);
      return { targetSubstr: null, error: 400 };
    }

    // go to the end of the start string
    startIdx += startDateStr.length
    let targetSubstr = htmlStr.substring(startIdx, endIdx);

    // now trim off <p> tags, returning 500 at each step if we
    // improperly parse the string
    startIdx = targetSubstr.indexOf('<p') + 3; // opening <p> tag plus its length
    if (startIdx === -1) {
      // return res.sendStatus(500);
      return { targetSubstr: null, error: 500 };
    }
    targetSubstr = targetSubstr.substring(startIdx).trim();

    // end <p> tag
    endIdx = targetSubstr.indexOf('</p>');
    if (endIdx === -1) {
      // return res.sendStatus(500);
      return { targetSubstr: null, error: 500 };
    }
    targetSubstr = targetSubstr.substring(0, endIdx).trim();

    // there should just be one closing tag left at the beginning now
    startIdx = targetSubstr.indexOf('>') + 1;
    if (startIdx === -1) {
      // return res.sendStatus(500);
      return { targetSubstr: null, error: 500 };
    }
    targetSubstr = targetSubstr.substring(startIdx).trim();

    return { targetSubstr: targetSubstr, error: null };
  }
};

module.exports = util;
