/** 
 * Parsing JUnit report (target/surefire-reports/*.xml)
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

function buildTestResultByMethodName(obj) {
  if (!obj || !obj.$ || !obj.$.name) {
    return undefined;
  }
  let name = `${obj.$.classname}#${obj.$.name}`;
  let exe_start_date = timestamp;
  let exe_end_date = timestamp;
  exe_end_date.setSeconds(exe_start_date.getSeconds() + (Math.floor(obj.$.time || 0)));

  let status = (undefined != obj.skipped) ? "SKIPPED" : obj.failure ? "FAILED" : "PASSED";
  let testCase = {
    status: status,
    name: name,
    attachments: [],
    exe_start_date: exe_start_date.toISOString(),
    exe_end_date: exe_end_date.toISOString(),
    automation_content: name,
    test_step_logs: [{
      order: 0,
      status: status,
      description: obj.$.name,
      expected_result: obj.$.name
    }]
  };
  if (obj.failure) {
    testCase.attachments.push({
      name: `${obj.$.name}.txt`,
      data: Buffer.from(obj.failure._).toString("base64"),
      content_type: "text/plain"
    });
  }
  return testCase;
}

async function buildTestResultByClassName(obj) {
  if (!obj || !obj.$ || !obj.$.name) {
    return undefined;
  }
  let buildAttachmentAndTestStepLogs = async (testcases) => {
    let attachments = [];
    let testStepLogs = [];
    let fileMap = new Map();
    let order = 0;

    for (let tc of testcases) {
      if (tc) {
        testStepLogs.push({
          order: order++,
          status: (undefined != tc.skipped) ? "SKIPPED" : tc.failure ? "FAILED" : "PASSED",
          description: tc.$.name,
          expected_result: tc.$.name
        });

        let fileName = tc.$.name;
        if (tc.failure) {
          if (fileMap.has(fileName)) {
            let newValue = fileMap.get(fileName) + 1;
            fileMap.set(fileName, newValue);
            fileName += `_${newValue}`
          } else {
            fileMap.set(fileName, 1);
          }
          attachments.push({
            name: `${fileName}.txt`,
            data: Buffer.from(tc.failure._).toString("base64"),
            content_type: "text/plain"
          });
        }
      }
    }

    if (MAX_LOG_FILE < attachments.length) {
      //let tmpFolder = tmp.dirSync();
      let tmpFolder = fs.mkdtempSync(path.join(os.homedir(), "junit-parser"));
      for (let a of attachments) {
        fs.writeFileSync(path.join(tmpFolder, a.name), Buffer.from(a.data, "base64"));
      }
      try {
        await zipFolder(tmpFolder, "*.txt", path.join(`${tmpFolder}`, `${obj.$.name}.zip`));
        attachments = [{
          name: `${obj.$.name}.zip`,
          data: fs.readFileSync(path.join(`${tmpFolder}`, `${obj.$.name}.zip`), {
            encoding: "base64"
          }),
          content_type: "application/zip"

        }];
      } catch (ex) {
        console.error(ex);
      }

      deleteFolderSync(tmpFolder);
    }
    return {
      attachments,
      testStepLogs
    }
  };

  let name = obj.$.name;

  let exe_start_date = timestamp;
  let exe_end_date = timestamp;
  exe_end_date.setSeconds(exe_start_date.getSeconds() + (Math.floor(obj.$.time || 0)));
  let status = (+obj.$.tests !== 0) && (+obj.$.failures === 0) ? "PASSED" : "FAILED";
  let testcases = Array.isArray(obj.testcase) ? obj.testcase : [obj.testcase];
  let attchment_steplogs = await buildAttachmentAndTestStepLogs(testcases);
  let testCase = {
    status: status,
    name: name,
    attachments: attchment_steplogs.attachments,
    exe_start_date: exe_start_date.toISOString(),
    exe_end_date: exe_end_date.toISOString(),
    automation_content: name,
    test_step_logs: attchment_steplogs.testStepLogs
  };
  return testCase;
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

  let resultMap = new Map();
  let order = 0;
  for (let file of resultFiles) {
    console.log(`Parsing ${file} ...`);
    let parseFileResult = undefined;
    try {
      parseFileResult = await parseFile(file);
    } catch (error) {
      console.error(`Could not parse ${file}`, error);
      continue;
    }

    if (true === useClassNameAsTestCaseName) {
      let tcObj = await buildTestResultByClassName(parseFileResult.testsuite);
      if (tcObj && !resultMap.has(tcObj.automation_content)) {
        tcObj.order = order++;
        resultMap.set(tcObj.automation_content, tcObj);
      };
    } else {
      let testcases = Array.isArray(parseFileResult.testsuite.testcase) ? parseFileResult.testsuite.testcase : [parseFileResult.testsuite.testcase]
      for (let tc of testcases) {
        let tcObj = buildTestResultByMethodName(tc);
        if (tcObj && !resultMap.has(tcObj.automation_content)) {
          tcObj.order = order++;
          resultMap.set(tcObj.automation_content, tcObj);
        };
      }
    }
    console.log(`Finish parsing ${file}`);
  }
  return (Array.from(resultMap.values()));
};

module.exports = {
  parse: parse
};