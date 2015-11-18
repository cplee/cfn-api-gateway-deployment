
var https = require('https');

var AWS = require('aws-sdk');
var aws4 = require('aws4');

var APIG = new AWS.APIGateway({apiVersion: '2015-07-09'});

var credentials = new AWS.EnvironmentCredentials('AWS');
var signingOptions = {
  accessKeyId: credentials.accessKeyId,
  secretAccessKey: credentials.secretAccessKey,
  sessionToken: credentials.sessionToken
};

var CfnLambda = require('cfn-lambda');

var Delete = CfnLambda.SDKAlias({
  api: APIG,
  method: 'deleteDeployment',
  physicalIdAs: 'DeploymentId',
  returnPhysicalId: 'id',
  downcase: true,
  keys: [
    'RestApiId',
    'DeploymentId'
  ],
  ignoreErrorCodes: [404]
});

exports.handler = CfnLambda({
  Create: Create,
  Update: Update,
  Delete: Delete,
  SchemaPath: [__dirname, 'schema.json'],
  TriggersReplacement: ['RestApiId', 'StageName']
});

function Create(params, reply) {
  APIGcreateDeployment(params,
    handleReply(reply, params.StageName, params.RestApiId));
}

function Update(physicalId, params, oldParams, reply) {

  var params = {
    deploymentId: physicalId,
    restApiId: params.RestApiId,
    patchOperations: []
  };

  [
    'StageDescription',
    'Description',
    'CacheClusterEnabled',
    'CacheClusterSize',
    'Variables'
  ].forEach(patch);

  console.log('Calling APIGateway.updateDeployment with: %j', params);

  APIG.updateDeployment(params,
    handleReply(reply, params.StageName, params.RestApiId));

  function patch(key) {
    var keyPath = '/' + key[0] + key.slice(1, key.length);
    if (same(key)) {
      return;
    }
    if (!oldParams[key]) {
      return params.patchOperations.push({
        op: 'add',
        path: keyPath,
        value: params[key]
      });
    }
    if (!params[key]) {
      return params.patchOperations.push({
        op: 'remove',
        path: keyPath
      });
    }
    params.patchOperations.push({
      op: 'replace',
      path: keyPath,
      value: params[key]
    });
  }

  function same(key) {
    return params[key] === oldParams[key];
  }
}

function APIGcreateDeployment(params, forwardToReplyHandler) {
  var body = JSON.stringify({
    stageName: params.StageName,
    stageDescription: params.StageDescription,
    description: params.Description,
    cacheClusterEnabled: params.CacheClusterEnabled,
    cacheClusterSize: params.CacheClusterSize,
    variables: params.Variables
  });
  var options = {
    service: 'apigateway',
    region: CfnLambda.Environment.Region,
    method: 'POST',
    path: '/restapis/' + params.RestApiId + '/deployments',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': body.length
    },
    body: body
  };
  var options = aws4.sign(options, signingOptions);

  console.log('Calling APIGateway POST deployment: %j', options);

  var req = https.request(options, function(res) {
    var buffer = [];
    res.on('data', function(chunk) {
      buffer.push(chunk);
    });
    res.on('end', function() {
      var code = res.statusCode;
      var body = buffer.join('');
      var json;
      try {
        json = JSON.parse(body);
      } catch (err) {
        console.log('API Gateway API POST return body was not JSON: %s', body);
        return forwardToReplyHandler(err);
      }
      if (code < 400 && code >= 200){
        forwardToReplyHandler(null, json);
      } else {
        console.log('Error code from API Gateway POST (%s): %j', code, json);
        forwardToReplyHandler(json);
      }
    });
  });
  req.on('error', function(err) {
    console.log('Error connecting to AWS API Gateway on POST: %j', err);
    forwardToReplyHandler(err);
  });
  req.write(body);
  req.end();
}

function handleReply(reply, stageName, restApiId) {
  return function(err, deployment) {
    if (err) {
      console.error(err.message);
      return reply(err.message);
    }
    reply(null, deployment.id, {
      InvokeURL: 'https://' + restApiId +
        '.execute-api.us-east-1.amazonaws.com/' + stageName
    });
  };
}
