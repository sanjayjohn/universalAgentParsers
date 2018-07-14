const parser = require("../parser.js");

(async () => {


  try {
    console.log(`Parse Robot report`);
    var ret = await parser.parse("./tests/sample-robot-results/output.xml");
    console.log(JSON.stringify(ret, null, 4))
  } catch (ex) {
    console.error(ex);
  }


})();