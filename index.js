
var https = require('https');

var AWS = require('aws-sdk');
var CfnLambda = require('cfn-lambda');

var APIG = new AWS.APIGateway({apiVersion: '2015-07-09'});

var ignorableDeletionErrorMessage = 'Active stages pointing ' +
  'to this deployment must be moved or deleted';

exports.handler = CfnLambda({
  Create: Create,
  Update: Update,
  Delete: Delete,
  NoUpdate: NoUpdate,
  SchemaPath: [__dirname, 'schema.json'],
  TriggersReplacement: [
    'RestApiId',
    'StageName',
    'StageDescription',
    'Variables',
    'CacheClusterEnabled',
    'CacheClusterSize'
  ]
});

function Create(params, reply) {
  CfnLambda.SDKAlias({
    api: APIG,
    method: 'createDeployment',
    forceBools: ['CacheClusterEnabled'],
    returnPhysicalId: 'id',
    downcase: true,
    returnAttrs: function() {
      return {
        InvokeURL: 'https://' + params.RestApiId +
          '.execute-api.us-east-1.amazonaws.com/' + params.StageName
      }
    }
  })(params, reply);
}

function Update(physicalId, params, oldParams, reply) {
  console.log('Updating deployment %s description ' +
    'to be: %s', physicalId, params.Description);
  var updateParams = {
    deploymentId: physicalId,
    restApiId: params.RestApiId,
    patchOperations: [
      {
        op: 'replace',
        path: '/description',
        value: params.Description || ''
      }
    ]
  };
  console.log('Sending updateDeployment to %s using ' +
    'values: %j', physicalId, updateParams);
  APIG.updateDeployment(updateParams, function(updateErr, updateData) {
    if (updateErr) {
      console.error('Failed to update deployment %s: %j', physicalId, updateErr);
      return reply(updateErr.message || ('FATAL: ' + updateErr.code));
    }
    console.log('Successfully updated! %j', updateData);
    reply(null, physicalId, {
      InvokeURL: 'https://' + params.RestApiId +
        '.execute-api.us-east-1.amazonaws.com/' + params.StageName
    });
  });
}

function Delete(physicalId, params, reply) {
  CfnLambda.SDKAlias({
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
  })(physicalId, params, function(errMessage, resultId, resultHash) {
    if (errMessage === ignorableDeletionErrorMessage) {
      return reply(null, resultId, resultHash);
    }
    reply(errMessage, resultId, resultHash);
  });
}

function NoUpdate(physicalId, params, reply) {
  APIG.getDeployment({
    restApiId: params.RestApiId,
    deploymentId: physicalId
  }, function(getErr, deployment) {
    if (getErr) {
      console.error('Error during NoUpdate getting ' +
        'deployment %s from API %s: %j',
        physicalId, params.RestApiId, getErr);
      return reply(getErr.message);
    }
    console.log('During NoUpdate, was able to ' +
      'get deployment %s from API %s: %j',
      physicalId, params.RestApiId, deployment);
    reply(null, deployment.id, {
      InvokeURL: 'https://' + params.RestApiId +
        '.execute-api.us-east-1.amazonaws.com/' + params.StageName
    });
  });
}
