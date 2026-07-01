"""Minimal pure-Python detectron2 shim.

The fine-tuned BiomedParse model code imports a small, fixed set of symbols from
detectron2 (layers.Conv2d/DeformConv/ShapeSpec/get_norm and
modeling.SEM_SEG_HEADS_REGISTRY/Backbone). The upstream package ships compiled C++
ops (detectron2._C) that don't build cleanly on macOS arm64 against torch 2.1.2, and
none of those ops are exercised by the FPN pixel-decoder eval path this service uses.

This shim provides faithful, dependency-free implementations of exactly those symbols
so `from detectron2.layers import ...` resolves with the *correct* Conv2d wrapper
(the one that accepts norm=/activation= kwargs), instead of the project's broken
torch.nn.Conv2d fallback. Created for local-dev parity; replace with real detectron2
on a CUDA/Linux box.
"""
__version__ = "0.6+biomedparse-shim"
