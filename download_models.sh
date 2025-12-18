#!/bin/bash
mkdir -p public/models
cd public/models

BASE_URL="https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights"

echo "Downloading face-api.js models..."

# SSD Mobilenet v1
curl -O "$BASE_URL/ssd_mobilenetv1_model-weights_manifest.json"
curl -O "$BASE_URL/ssd_mobilenetv1_model-shard1"
curl -O "$BASE_URL/ssd_mobilenetv1_model-shard2"

# Face Landmark 68
curl -O "$BASE_URL/face_landmark_68_model-weights_manifest.json"
curl -O "$BASE_URL/face_landmark_68_model-shard1"

# Face Recognition
curl -O "$BASE_URL/face_recognition_model-weights_manifest.json"
curl -O "$BASE_URL/face_recognition_model-shard1"
curl -O "$BASE_URL/face_recognition_model-shard2"

echo "Download complete!"
