const AWS = require("aws-sdk");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
require("dotenv").config();

const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const region = process.env.awsregion;
const bucketName = process.env.bucket;
const suiteId = process.env.suiteid;
const authorization = process.env.authorization;
const x_poolindex = process.env.x_poolindex;
const x_groupuser_id = process.env.x_groupuser_id;
const x_account_id = process.env.x_account_id;
const api_result_uri = process.env.api_result_uri;
const rootDir = process.env.rootDir || "/repo";
const resultFilePath =
  process.env.resultFilePath || ".*\\.(html|pdf|png|jpg|jpeg|gif)$";
const videoFilePath = process.env.videoFilePath || ".*\\.(mp4|mkv)$";
const resultjsonfile = process.env.resultjsonfile;
const testenv = process.env.testenv;
const testsuite2feature = process.env.testsuite2feature;
const userid = process.env.userid;
const runby = process.env.runby;
let tesreultid;

AWS.config.update({ region, accessKeyId, secretAccessKey });
const s3 = new AWS.S3();
let urls = [];
let htmlPdfUrls = []; // To store only HTML and PDF URLs

const getFiles = (dir, pattern) => {
  let regex;
  if (pattern.includes("*")) {
    pattern = pattern.replace(/\*/g, ".*");
  }
  if (!pattern.includes(".")) {
    pattern = `${pattern}.*\\.(html|pdf|png|jpg|jpeg|gif|mp4|mkv)$`;
  }

  regex = new RegExp(pattern);
  let results = [];
  const list = fs.readdirSync(dir);

  list.forEach((file) => {
    file = path.resolve(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFiles(file, pattern));
    } else {
      if (regex.test(file)) {
        results.push(file);
      }
    }
  });

  return results;
};

const findJsonFile = (rootDir, resultJsonFileName) => {
  const resultJsonFilePath = path.join(rootDir, resultJsonFileName);
  if (fs.existsSync(resultJsonFilePath)) {
    return resultJsonFilePath;
  }
  throw new Error(`Result JSON file not found: ${resultJsonFileName}`);
};

const uploadFileToS3 = async (filePath, key) => {
  const fileContent = fs.readFileSync(filePath);
  const params = {
    Bucket: bucketName,
    Key: key,
    Body: fileContent,
  };
  await s3.upload(params).promise();
  return `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;
};

const readAndUploadLog = async (logFilePath, logFileName) => {
  try {
    if (fs.existsSync(logFilePath)) {
      const keyName = `logs/${suiteId}_${Date.now()}_${logFileName}`;
      await uploadFileToS3(logFilePath, keyName);
      return keyName;
    } else {
      console.error(`File ${logFilePath} does not exist.`);
    }
  } catch (error) {
    console.error(`Error reading or uploading ${logFileName}:`, error);
  }
};

const updateLogAndTestResult = async (
  testlogurl,
  scriptlogurl,
  resultpdfhtmlurl,
  totalTest,
  passed,
  failed,
  skipped
) => {
  try {
    const data = {
      suiteid: suiteId,
      testlogurl: testlogurl,
      scriptlogurl: scriptlogurl,
      resulturl: resultpdfhtmlurl,
      totaltestcnt: totalTest,
      passedcnt: passed,
      failedcnt: failed,
      skippedcnt: skipped,
      testenv: testenv,
    };

    console.log("Calling updateTestResult:", JSON.stringify(data));
    const response = await axios.post(
      `${api_result_uri}/docker/update-testresult`,
      data,
      {
        headers: {
          Authorization: `${authorization}`,
          x_account_id: x_account_id,
          x_groupuser_id: x_groupuser_id,
          x_poolindex: x_poolindex,
        },
      }
    );
    tesreultid = response.data.resultid;
    console.log("Update Test Result response:", response.data.message);
  } catch (error) {
    if (error.response && error.response.data.error === "Invalid token") {
      console.error("Invalid token:", error);
    } else {
      console.error("Error updating test result:", error);
    }
  }
};

const saveTestFailure = async (failureData, scriptlogurl) => {
  try {
    const data = {
      suiteid: suiteId,
      featureid: testsuite2feature,
      reportid: tesreultid,
      userid: userid,
      runby: runby,
      stepname: failureData.step,
      scenarioname: failureData.scenario,
      description: failureData.reason,
      reporturl: scriptlogurl,
      x_groupuser_id: x_groupuser_id,
    };

    const response = await axios.post(
      `${api_result_uri}/docker/insert-test-failure`,
      data,
      {
        headers: {
          Authorization: `${authorization}`,
          x_account_id: x_account_id,
          x_groupuser_id: x_groupuser_id,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("TestFailure created:", response.data);
  } catch (error) {
    console.log(error);
    console.error("Error creating TestFailure:", error);
  }
};

const uploadAllLogs = async () => {
  try {
    const testlogurl = await readAndUploadLog(
      "/usr/scripts/testlog.log",
      "testlog.log"
    );
    urls.push(testlogurl);

    const scriptlogurl = await readAndUploadLog(
      "/usr/scripts/alllogs.log",
      "alllogs.log"
    );
    urls.push(scriptlogurl);

    const resultFiles = getFiles(rootDir, resultFilePath);

    for (const file of resultFiles) {
      const s3Path = `${suiteId}/results/${Date.now()}_${path.basename(file)}`;
      const resultlogurl = await uploadFileToS3(file, s3Path);
      if (s3Path.includes("html") || s3Path.includes("pdf")) {
        htmlPdfUrls.push(s3Path); // Only push HTML and PDF files to urls
      }
    }

    const videoFiles = getFiles(rootDir, videoFilePath);

    for (const file of videoFiles) {
      const s3Path = `${suiteId}/videos/${Date.now()}_${path.basename(file)}`;
      const videourls = await uploadFileToS3(file, s3Path);
      urls.push(videourls);
    }

    const resultJsonFileName = resultjsonfile || "scenario-summary.json";
    const resultJsonFilePath = findJsonFile(rootDir, resultJsonFileName);

    const resultJsonContent = fs.readFileSync(resultJsonFilePath, "utf-8");
    const resultData = JSON.parse(resultJsonContent);

    const totalTests = resultData.total;
    const passedTests = resultData.passed;
    const failedTests = resultData.failed;
    const skippedTests = resultData.skipped;

    await updateLogAndTestResult(
      testlogurl,
      scriptlogurl,
      htmlPdfUrls.join(";"), // Join only HTML and PDF URLs
      totalTests,
      passedTests,
      failedTests,
      skippedTests
    );

    // Process and save each failed scenario
    const failedJsonFileName = resultFilePath + "/failures.json";
    const failedJsonFilePath = findJsonFile(rootDir, failedJsonFileName);

    const failedJsonContent = fs.readFileSync(failedJsonFilePath, "utf-8");
    const failedJsonData = JSON.parse(failedJsonContent);

    for (const failureData of failedJsonData) {
      await saveTestFailure(failureData, scriptlogurl);
    }
  } catch (error) {
    if (error.response && error.response.data.error === "Invalid token") {
      console.error("Invalid token:", error);
    } else {
      console.error("Error uploading files:", error);
    }
  }
};

uploadAllLogs();
