const parser = require("../parser.js");

(async () => {

  try {
    console.log(`Parse JUnit report - test case name as method name`);
    var ret = await parser.parse("./tests/sample-selenium-results/TestResult2.xml");
    console.log(JSON.stringify(ret, null, 4))
  } catch (ex) {
    console.error(ex);
  }

})();