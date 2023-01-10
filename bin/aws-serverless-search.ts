#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AwsServerlessSearchStack } from '../lib/stacks/aws-serverless-search-stack';

const app = new cdk.App();
new AwsServerlessSearchStack(app, 'AwsServerlessSearchStack');