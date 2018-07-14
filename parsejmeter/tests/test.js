const parser = require("../parser.js");

(async () => {

  try {
    console.log(`Parse JUnit report - test case name as method name`);
    var ret = await parser.parse("./tests/sample-jmeter-results/result1529353648356.xml");
    console.log(JSON.stringify(ret, null, 4))
  } catch (ex) {
    console.error(ex);
  }

})();