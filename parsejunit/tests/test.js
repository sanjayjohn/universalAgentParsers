const parser = require("../parser.js");

(async () => {
  try {
    console.log(`Parse JUnit report - test case name as method name`);
    var ret = await parser.parse("./tests/sample-junit-results/");
    console.log(JSON.stringify(ret, null, 4));
  } catch (ex) {
    console.error(ex);
  }

  try {

    let classNameAsTestCaseName = true;
    console.log(`Parse JUnit report - test case name as class name`);
    var ret = await parser.parse("./tests/sample-junit-results/result1529609855330.xml");
    console.log(JSON.stringify(ret, null, 4))
  } catch (ex) {
    console.error(ex);
  }

  // try {
  //   console.log(`Parse JUnit report - test case name as method name`);
  //   var ret = await parser.parse("./tests/sample-junit-results/TEST-sample.junit.CalculateTest.xml");
  //   console.log(JSON.stringify(ret, null, 4))
  // } catch (ex) {
  //   console.error(ex);
  // }

  // try {
  //   let classNameAsTestCaseName = true;
  //   console.log(`Parse JUnit report - test case name as class name`);
  //   var ret = await parser.parse("./tests/sample-junit-results/TEST-sample.junit.CalculateTest.xml", classNameAsTestCaseName);
  //   console.log(JSON.stringify(ret, null, 4))
  // } catch (ex) {
  //   console.error(ex);
  // }

})();