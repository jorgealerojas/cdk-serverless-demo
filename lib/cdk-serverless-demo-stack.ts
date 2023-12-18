import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';


export class CdkServerlessDemoStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const lambdaEnvironment = {
      "DYNAMO_DB_TABLE": "Example"
    }

    // Setting the domain and getting the hosted zone
    const apiDomain = 'example.com';
    const wildCardDomain = "*.example.com";
    const apiRecordName = "api.example.com";
    const apiZone = route53.HostedZone.fromLookup(this, 'DemoHostedZone', {
        domainName: apiDomain,
    });

    // Create ACM certificate for dev.hatz.ai
    const apiCertificate = new acm.Certificate(this, 'ApiCertificate', {
        domainName: apiDomain,
        validation: acm.CertificateValidation.fromDns(apiZone),
        subjectAlternativeNames: [wildCardDomain],
    });
    new cdk.CfnOutput(this, 'ApiCertificateArn', { value: apiCertificate.certificateArn });


    // Create the Lambda Task Execution Role
    const lambdaExecutionRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });
    
    lambdaExecutionRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents'
      ],
      resources: ['arn:aws:logs:*:*:*']
    }));


    // Define the Lambda functions
    const function1 = new lambda.Function(this, 'Function1', {
        timeout: cdk.Duration.minutes(13),
        code: lambda.Code.fromAsset('lambda'),  // code loaded from "lambda" directory
        handler: 'hello.handler',               // file is "hello", function is "handler"
        role: lambdaExecutionRole,
        architecture: lambda.Architecture.ARM_64,
        runtime: lambda.Runtime.NODEJS_16_X, 
        environment: lambdaEnvironment,
        currentVersionOptions: {
          provisionedConcurrentExecutions: 1,
        }
    });

    
    // Create a Role for API GTW
    const apiGatewayRole = new iam.Role(this, 'ApiGatewayRole', {
        assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
    });
          
    apiGatewayRole.addToPolicy(new iam.PolicyStatement({
        actions: ['lambda:InvokeFunction'],
        resources: ['*'] 
    }));
    
    // Define the API Gateway
    const apiGtw = new apigateway.RestApi(this, 'ApiGateway', {
      restApiName: 'DemoApi',
      domainName: {
        domainName: apiRecordName,
        certificate: apiCertificate
      }
    });

    // Create a new deployment for the API
    const deployment = new apigateway.Deployment(this, 'Deployment', {
      api: apiGtw
    });

    // Define the stage
    const apiStage = new apigateway.Stage(this, 'ApiStage', {
      deployment,
      stageName: 'dev' 
    });


    apiGtw.root.addResource('test1').addMethod('GET', new apigateway.LambdaIntegration(function1, {
      credentialsRole: apiGatewayRole
    }));

    // Create the API GTW Route 53 A record
    new route53.ARecord(this, "ApiRecord", {
        recordName: apiRecordName,
        zone: apiZone,
        target: route53.RecordTarget.fromAlias(new route53Targets.ApiGateway(apiGtw)),
    })
  } 
}
