/** 
 * Parsing Selenium C Sharp Results built by nunit console runner (bin/Debug/TestResult.xml)
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

function buildResultByTestMethod(obj, suite) {
  if (!obj || !obj.$ || !obj.$.name) {
    return undefined;
  }
  let className = obj.$.classname;
  let methodName = obj.$.methodname;
  if (className == undefined || methodName == undefined) {
    className = obj.$.fullname
    methodName = obj.$.name
  }
  let methodStatus = obj.$.result;
  let startTime = obj.$["start-time"];
  let endTime = obj.$["end-time"];
  if (startTime == undefined || endTime == undefined) {
    startTime = timestamp.toISOString();
    endTime = timestamp.toISOString();
  } else {
    let startDate = startTime.split(" ");
    let endDate = endTime.split(" ");
    startTime = startDate[0] + "T" + startDate[1];
    endTime = endDate[0] + "T" + endDate[1];
  }
  let note = '';
  let stack = '';
  if (methodStatus == 'Failed') {
      methodStatus = 'FAIL';
  } else if (methodStatus == 'Passed') {
      methodStatus = 'PASS';
  } else {
      methodStatus = 'SKIP';
  }
  if (methodStatus == 'FAIL') {
    note = obj.failure.message;
    stack = obj.failure["stack-trace"];
  }
  let testLog = {
    status: methodStatus,
    name: methodName,
    attachments: [],
    note: note,
    exe_start_date: startTime,
    exe_end_date: endTime,
    automation_content: className + "#" + methodName,
    module_names: [className, methodName]
  };
  if (stack != undefined && stack != '') {
    testLog.attachments.push({
      name: `${methodName}.txt`,
      data: Buffer.from(stack).toString("base64"),
      content_type: "text/plain"
    });
  }
  if (testLog && !resultMap.has(testLog.automation_content)) {
    testLog.order = order++;
    resultMap.set(testLog.automation_content, testLog);
  }
}

function findTestCaseTag(obj) {
  if (obj != undefined && obj["test-case"] != undefined) {
    return obj["test-case"];
  } else if (obj != undefined) {
    return findTestCaseTag(obj["test-suite"]);
  }
}

function buildResultsBySuite(obj) {
  let suite = obj.$.fullname;
  let testCases = findTestCaseTag(obj);
  let testClasses = Array.isArray(testCases) ? testCases : [testCases];
  for (let tc of testClasses) {
    buildResultByTestMethod(tc, suite);
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

function findTestSuiteArray(obj) {
  if (obj["test-suite"] == undefined) {
  	return obj;
  }
  if (Array.isArray(obj)) {
    return obj;
  } else {
    return findTestSuiteArray(obj["test-suite"]);
  }
}

async function parse(pathToTestResult, useClassNameAsTestCaseName) {
  if (!fs.existsSync(pathToTestResult)) {
    throw new Error(`Test result not found at ${pathToTestResult}`);
  }
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
    let testSuites = findTestSuiteArray(parseFileResult["test-run"]);
    testSuites = Array.isArray(testSuites) ? testSuites : [testSuites];
    for (let ts of testSuites) {
      await buildResultsBySuite(ts);
    }
    console.log(`Finish parsing ${file}`);
  }
  return (Array.from(resultMap.values()));
};

module.exports = {
  parse: parse
};