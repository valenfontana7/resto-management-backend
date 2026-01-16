#!/usr/bin/env node
/*
  Script: check-spaces-images.js
  - Verifica si imágenes específicas existen en DigitalOcean Spaces
  Requiere variables en env: S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_KEY, S3_SECRET
  Ejecutar: node scripts/check-spaces-images.js
*/

require('dotenv').config();
const { S3Client, HeadObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');

const bucket = process.env.S3_BUCKET;
const region = process.env.S3_REGION || 'us-east-1';
const endpoint = process.env.S3_ENDPOINT;
const keyPrefix = process.env.S3_KEY_PREFIX || '';
const normalizedPrefix = keyPrefix ? keyPrefix.replace(/^\/+|\/+$/g, '') + '/' : '';

if (!bucket || !process.env.S3_KEY || !process.env.S3_SECRET) {
  console.error('Missing S3 env vars. Set S3_BUCKET, S3_KEY, S3_SECRET.');
  process.exit(1);
}

const s3 = new S3Client({
  region,
  endpoint: endpoint || undefined,
  credentials: {
    accessKeyId: process.env.S3_KEY,
    secretAccessKey: process.env.S3_SECRET,
  },
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true' || false,
});

// Keys que están fallando según el usuario
const keysToCheck = [
  'dishes/1767599782904-roa4.jpeg',
  'images/1767741598066-s4owx2.jpg',
];

async function listBucketContents() {
  try {
    console.log('Listing bucket contents...');
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      MaxKeys: 20,
    });

    const result = await s3.send(command);
    if (result.Contents && result.Contents.length > 0) {
      console.log('Found objects:');
      result.Contents.forEach(obj => {
        console.log(`  - ${obj.Key} (${obj.Size} bytes, ${obj.LastModified})`);
      });
    } else {
      console.log('Bucket is empty or no objects found');
    }
  } catch (error) {
    console.error('Error listing bucket contents:', error.message);
  }
}

async function checkImage(key) {
  try {
    const physicalKey = normalizedPrefix ? `${normalizedPrefix}${key}` : key;
    console.log(`Checking key: ${key} (physical: ${physicalKey})`);

    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: physicalKey,
    });

    const result = await s3.send(command);
    console.log(`✅ EXISTS: ${key}`);
    console.log(`   Content-Type: ${result.ContentType}`);
    console.log(`   Content-Length: ${result.ContentLength}`);
    console.log(`   Last-Modified: ${result.LastModified}`);
    console.log(`   ETag: ${result.ETag}`);
    return true;
  } catch (error) {
    if (error.name === 'NotFound') {
      console.log(`❌ NOT FOUND: ${key}`);
      return false;
    } else {
      console.error(`❌ ERROR checking ${key}:`, error.message);
      return false;
    }
  }
}

async function main() {
  console.log('Checking Spaces configuration:');
  console.log(`Bucket: ${bucket}`);
  console.log(`Region: ${region}`);
  console.log(`Endpoint: ${endpoint || 'default'}`);
  console.log(`Key Prefix (raw): "${keyPrefix}"`);
  console.log(`Key Prefix (normalized): "${normalizedPrefix}"`);
  console.log('');

  await listBucketContents();
  console.log('');

  for (const key of keysToCheck) {
    await checkImage(key);
    console.log('');
  }
}

main().catch(console.error);