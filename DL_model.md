# Deep Learning Model

## Overview
The model performs **semantic segmentation** on satellite image tiles using **PyTorch**. Each tile is 48x48 pixels with 13 channels (multispectral bands + NDVI). The goal is to classify each pixel based on the crop type it belongs to.

## Architecture
- U-Net decoder with a **ResNet-18 encoder**
- Input shape: (13, 48, 48)
- Output: (8, 48, 48) – 8 crop classes
- Loss function: CrossEntropyLoss
- Optimizer: Adam
- Learning rate: 0.001
- Epochs: 200
- Batch size: 16

## Preprocessing & Augmentation
- Normalization per spectral band
- Rare-class boosting with oversampling
- Data augmentations:
  - Random rotations/flips
  - Brightness/contrast adjustments

## Integration
- Inference endpoint served via Django REST Framework
- Input: GeoJSON field + selected date
- Output: predicted crop mask (PNG) + class stats

## What I Learned
This project deepened my understanding of:
- Building custom DL pipelines in PyTorch
- Managing spatiotemporal datasets
- Handling class imbalance in real-world data
- Integrating ML models into web apps
