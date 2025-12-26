#!/usr/bin/env node
/*
  Script: migrate-uploads-to-spaces.js
  - Sube recursivamente `uploads/` a DigitalOcean Spaces (S3 compatible)
  - Actualiza campos en la DB que contienen rutas locales `/uploads/...`
  Requiere variables en env: S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_KEY, S3_SECRET
  Ejecutar: `node scripts/migrate-uploads-to-spaces.js`
*/

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { PrismaClient } = require('@prisma/client');

const uploadsDir = path.join(process.cwd(), 'uploads');
const bucket = process.env.S3_BUCKET;
const region = process.env.S3_REGION;
const endpoint = process.env.S3_ENDPOINT; // optional

if (!bucket || !process.env.S3_KEY || !process.env.S3_SECRET) {
  console.error('Missing S3 env vars. Set S3_BUCKET, S3_KEY, S3_SECRET (and S3_REGION).');
  process.exit(1);
}

const s3 = new S3Client({
  region: region || 'us-east-1',
  endpoint: endpoint || undefined,
  credentials: { accessKeyId: process.env.S3_KEY, secretAccessKey: process.env.S3_SECRET },
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true' || false,
});

const prisma = new PrismaClient();

function contentTypeFromFilename(filename) {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.svg':
      return 'image/svg+xml';
    case '.pdf':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
}

async function uploadFile(localPath, key) {
  const fileStream = fs.createReadStream(localPath);
  const contentType = contentTypeFromFilename(localPath);
  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: fileStream,
    ACL: 'public-read',
    ContentType: contentType,
  });
  await s3.send(cmd);
}

function buildPublicUrl(key) {
  // If endpoint provided and contains host without bucket, construct using bucket host pattern
  if (endpoint && endpoint.includes('digitaloceanspaces.com')) {
    // digitalocean format: {bucket}.{region}.digitaloceanspaces.com
    return `https://${bucket}.${region}.digitaloceanspaces.com/${key}`;
  }
  if (endpoint) {
    // fallback: use endpoint + key
    return `${endpoint.replace(/\/$/, '')}/${key}`;
  }
  return `https://${bucket}.${region}.digitaloceanspaces.com/${key}`;
}

async function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (entry.isFile()) {
      const rel = path.relative(uploadsDir, full).split(path.sep).join('/');
      const key = `uploads/${rel}`;
      console.log('Uploading', full, '->', key);
      try {
        await uploadFile(full, key);
        const publicUrl = buildPublicUrl(key);
        // Update DB: replace any field value equal to `/uploads/...` with public URL
        const localPath = `/uploads/${rel}`;

        // Restaurants: logo, coverImage
        await prisma.restaurant.updateMany({ where: { logo: localPath }, data: { logo: publicUrl } });
        await prisma.restaurant.updateMany({ where: { coverImage: localPath }, data: { coverImage: publicUrl } });

        // Categories: image
        await prisma.category.updateMany({ where: { image: localPath }, data: { image: publicUrl } });

        // Dishes: image
        await prisma.dish.updateMany({ where: { image: localPath }, data: { image: publicUrl } });

        console.log('Uploaded and DB updated for', localPath);
      } catch (err) {
        console.error('Failed to upload', full, err);
      }
    }
  }
}

async function main() {
  if (!fs.existsSync(uploadsDir)) {
    console.error('uploads directory not found at', uploadsDir);
    process.exit(1);
  }
  try {
    await walk(uploadsDir);
    console.log('Migration complete.');
  } catch (e) {
    console.error('Migration failed', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
