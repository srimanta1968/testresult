const { ClientSecretCredential } = require("@azure/identity");
const { StorageManagementClient } = require("@azure/arm-storage");
const { BlobServiceClient } = require("@azure/storage-blob");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const AWS = require("aws-sdk");
require("dotenv").config();

const azureClientId = process.env.azureClientId;
const azureClientSecret = process.env.azureClientSecret;
const azureTenantId = process.env.azureTenantId;
const azureSubscriptionId = process.env.azureSubscriptionId;
const containername = process.env.containername;
const resourceGroup = process.env.resourceGroup;
const storageAccountName = process.env.storageAccountName;
const registryServer = process.env.registryServer;
const registryUsername = process.env.registryUsername;
const registryPassword = process.env.registryPassword;

const accessKeyId = process.env.accessKeyId;
const secretAccessKey = process.env.secretAccessKey;
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
const provider = process.env.provider;

let accountName = storageAccountName;
let testreportid;

const getStorageAccountName = async () => {
  console.log("Using provided storage account name:", storageAccountName);
  return storageAccountName; // Use the provided account name directly
};

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

const uploadFileToAzure = async (filePath, blobName) => {
  const blobServiceClient = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    new ClientSecretCredential(azureTenantId, azureClientId, azureClientSecret)
  );
  const containerClient = blobServiceClient.getContainerClient(containername);
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  const fileContent = fs.readFileSync(filePath);
  await blockBlobClient.uploadData(fileContent);
  return `https://${accountName}.blob.core.windows.net/${containername}/${blobName}`;
};

const readAndUploadLog = async (logFilePath, logFileName) => {
  try {
    if (fs.existsSync(logFilePath)) {
      const keyName = `logs/${suiteId}_${Date.now()}_${logFileName}`;
      if (provider === "s3") {
        await uploadFileToS3(logFilePath, keyName);
      } else if (provider === "Azure") {
        await uploadFileToAzure(logFilePath, keyName);
      }
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
      `${api_result_uri}/docker/update-test-result`,
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
    testreportid = response.data.reportid;
    console.log("Update Test Result response:", response.data.message);
    console.log("Update Test Result Reportid:", testreportid);
  } catch (error) {
    console.error("Error updating test result:", error);
  }
};

const saveTestFailure = async (failureData, scriptlogurl, reporturl) => {
  if (!testreportid) {
    console.error("Test report ID is not defined. Cannot save test failure.");
    return;
  }

  try {
    const data = {
      suiteid: suiteId,
      featureid: testsuite2feature,
      reportid: testreportid,
      userid: userid,
      runby: runby,
      stepname: failureData.step,
      scenarioname: failureData.scenario,
      description: failureData.reason,
      i_logurl: scriptlogurl,
      i_reporturl: reporturl,
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
          x_poolindex: x_poolindex,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("TestFailure created:", response.data);
  } catch (error) {
    console.error("Error creating TestFailure:", error);
  }
};

const uploadAllLogs = async () => {
  try {
    if (provider === "Azure") {
      accountName = await getStorageAccountName();
    }

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
      const fileKey = `${suiteId}/results/${Date.now()}_${path.basename(file)}`;
      let resultlogurl;
      if (provider === "s3") {
        resultlogurl = await uploadFileToS3(file, fileKey);
      } else if (provider === "Azure") {
        resultlogurl = await uploadFileToAzure(file, fileKey);
      }
      if (fileKey.includes("html") || fileKey.includes("pdf")) {
        htmlPdfUrls.push(fileKey); // Only push HTML and PDF files to urls
      }
    }

    const videoFiles = getFiles(rootDir, videoFilePath);

    for (const file of videoFiles) {
      const fileKey = `${suiteId}/videos/${Date.now()}_${path.basename(file)}`;
      let videourl;
      if (provider === "s3") {
        videourl = await uploadFileToS3(file, fileKey);
      } else if (provider === "Azure") {
        videourl = await uploadFileToAzure(file, fileKey);
      }
      urls.push(videourl);
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

    // Ensure the test report ID is defined before saving failures
    if (!testreportid) {
      console.error(
        "Test report ID is not defined. Cannot save test failures."
      );
      return;
    }

    // Process and save each failed scenario
    const failedJsonFileName = resultFilePath + "/failures.json";
    const failedJsonFilePath = findJsonFile(rootDir, failedJsonFileName);

    const failedJsonContent = fs.readFileSync(failedJsonFilePath, "utf-8");
    const failedJsonData = JSON.parse(failedJsonContent);

    for (const failureData of failedJsonData) {
      await saveTestFailure(failureData, scriptlogurl, htmlPdfUrls.join(";"));
    }
  } catch (error) {
    console.error("Error uploading files:", error);
  }
};

uploadAllLogs();
