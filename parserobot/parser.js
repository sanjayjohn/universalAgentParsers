/** 
 * Parsing Robot report (output.xml)
 */

"use strict";

const fs = require("fs");
const globby = require("globby");
const xml2js = require("xml2js");
const path = require("path");
const archiver = require("archiver");
const os = require("os");

const MAX_LOG_FILE = 5;
const timestamp = new Date();
let resultMap = new Map();
let order = 0;
let doc = "";
let suiteType = false;
// delete folder  recursively
function deleteFolderSync(folderPath) {
  if (fs.existsSync(folderPath)) {
    fs.readdirSync(folderPath).forEach(function (file, index) {
      var curPath = folderPath + "/" + file;
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteFolderSync(curPath);
      } else { // delete file
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(folderPath);
  }
};

function zipFolder(folderPath, filePattern, outputFilePath) {
  return new Promise(function (resolve, reject) {
    var output = fs.createWriteStream(outputFilePath);
    var zipArchive = archiver('zip');

    output.on('close', function () {
      console.log(zipArchive.pointer() + ' total bytes');
      console.log('archiver has been finalized and the output file descriptor has closed.');
      resolve(undefined);
    });

    output.on('end', function () {
      console.log('Data has been drained');
      resolve(undefined);
    });

    zipArchive.on('warning', function (err) {
      if (err.code === 'ENOENT') {
        // log warning
      } else {
        reject(err);
      }
    });

    zipArchive.on('error', function (err) {
      reject(err);
    });

    // pipe archive data to the file
    zipArchive.pipe(output);

    zipArchive.glob(filePattern, {
      cwd: folderPath
    });
    zipArchive.finalize(function (err, bytes) {
      if (err) {
        reject(err);
      }
    });
  })

}

function buildTestResultsBySuite(obj) {
  if (!obj || !obj.$ || !obj.$.name) {
    return undefined;
  }
  let testCases = Array.isArray(obj.test) ? obj.test : [obj.test]
  let suiteName = obj.$.name;
  for (let tc of testCases) {
    if (suiteType != true) {
      buildTestResultByMethodName(tc, suiteName);
    } else {
      buildGherkinTestResults(tc, suiteName);
    }
  } 
}

function formatDate(obj) {
  if (obj.length < 9) {
    return null;
  }
  let year = obj.substring(0,4);
  let month = obj.substring(4,6);
  let day = obj.substring(6,8);
  let time = obj.substring(9, obj.length);
  return year + "-" + month + "-" + day + "T" + time + "Z";
}

function createTestCase(suite, status, testCaseName, methodName, note, startingTime, endingTime, testStepLogs) {
  let testCase = {
    status: status,
    name: methodName,
    note: note,
    exe_start_date: startingTime,
    exe_end_date: endingTime,
    automation_content: testCaseName + "#" + methodName,
    test_step_logs: testStepLogs,
    module_names: [suite, testCaseName, methodName],
  };
  return testCase;
}

function createTestCaseGherkin(suite, status, testCaseName, methodName, note, startingTime, endingTime, testStepLogs) {
  let testCase = {
    status: status,
    name: methodName,
    note: note,
    exe_start_date: startingTime,
    exe_end_date: endingTime,
    automation_content: suite + "#" + methodName,
    test_step_logs: testStepLogs,
    module_names: [suite, testCaseName, methodName],
  };
  return testCase;
}

function buildGherkinTestResults(obj, suite) {
  if (!obj || !obj.$ || !obj.$.name) {
    return undefined;
  }
  let testCaseName = obj.$.name;
  let status = obj.status.$.status;
  let startingTime = formatDate(obj.status.$.starttime);
  let endingTime = formatDate(obj.status.$.endtime);
  let note = "";
  let stepCount = 0;
  let stepLog = []
  let testMethods = Array.isArray(obj.kw) ? obj.kw : [obj.kw];
  for (let tm of testMethods) {
    if (tm.kw != undefined && tm.kw.doc != undefined) {
      doc = tm.kw.doc;
    } else {
      doc = tm.$.name;
    }
    stepLog.push({
      order: stepCount++,
      status: tm.status.$.status,
      description: tm.$.name,
      expected_result: doc
    });
  }
  let log = createTestCaseGherkin(suite, status, "Feature", testCaseName, note, startingTime, endingTime, stepLog);
  if (log && !resultMap.has(log.automation_content)) {
    log.order = order++;
    resultMap.set(log.automation_content, log);
  }
}

function buildTestResultByMethodName(obj, suite) {
  if (!obj || !obj.$ || !obj.$.name) {
    return undefined;
  }
  let testCaseName = obj.$.name;
  let status = obj.status.$.status;
  let startingTime = formatDate(obj.status.$.starttime);
  let endingTime = formatDate(obj.status.$.endtime);
  let note = "";
  let testMethods = Array.isArray(obj.kw) ? obj.kw : [obj.kw];
  for (let tm of testMethods) {
    let methodName = tm.$.name
    let status = tm.status.$.status;
    let stepCount = 0;
    let stepLog = []
    if (Array.isArray(tm.kw)) {
      let testStepsArray  = tm.kw;
      for (let ts in testStepsArray) {
        stepLog.push({
          order: stepCount++,
          status: testStepsArray[ts].status.$.status,
          description: testStepsArray[ts].$.name,
          expected_result: testStepsArray[ts].doc
        });
        if (testStepsArray[ts].msg != undefined) {
          note = testStepsArray[ts].msg._;
        }
      }
    }
    let log = createTestCase(suite, status, testCaseName, methodName, note, startingTime, endingTime, stepLog);
    if (log && !resultMap.has(log.automation_content)) {
      log.order = order++;
      resultMap.set(log.automation_content, log);
    }
  }

}

function parseFile(fileName) {
  return new Promise((resolve, reject) => {
    let jsonString = fs.readFileSync(fileName, "utf-8");
    xml2js.parseString(jsonString, {
      preserveChildrenOrder: true,
      explicitArray: false,
      explicitChildren: false
    }, function (err, result) {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
}

async function parse(pathToTestResult, useClassNameAsTestCaseName) {
  if (!fs.existsSync(pathToTestResult)) {
    throw new Error(`Test result not found at ${pathToTestResult}`);
  }
  suiteType = useClassNameAsTestCaseName;
  console.log("Path to test result: " + pathToTestResult);
  let resultFiles = [];
  if (fs.statSync(pathToTestResult).isFile()) {
    resultFiles.push(pathToTestResult);
  }
  if (fs.statSync(pathToTestResult).isDirectory()) {
    let pattern = undefined;
    pathToTestResult = pathToTestResult.replace(/\\/g, "/");
    if (pathToTestResult[pathToTestResult.length - 1] === '/') {
      pattern = pathToTestResult + "**/*.xml";
    } else {
      pattern = pathToTestResult + "/**/*.xml";
    }
    resultFiles = globby.sync(pattern);
  }
  if (0 === resultFiles.length) {
    throw new Error(`Could not find any result log-file(s) in: ' + pathToTestResult`);
  }
  for (let file of resultFiles) {
    console.log(`Parsing ${file} ...`);
    let parseFileResult = undefined;
    try {
      parseFileResult = await parseFile(file);
    } catch (error) {
      console.error(`Could not parse ${file}`, error);
      continue;
    }
    let testsuites = Array.isArray(parseFileResult.robot.suite.suite) ? parseFileResult.robot.suite.suite : [parseFileResult.robot.suite.suite]
    for (let ts of testsuites) {
      let tsObj = buildTestResultsBySuite(ts);
    }
    console.log(`Finish parsing ${file}`);
  }
  return (Array.from(resultMap.values()));
};

module.exports = {
  parse: parse
};