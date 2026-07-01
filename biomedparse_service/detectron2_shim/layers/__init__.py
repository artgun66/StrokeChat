"""detectron2.layers shim — faithful pure-Python versions of the symbols the
BiomedParse model imports: Conv2d, DeformConv, ShapeSpec, get_norm."""
from __future__ import annotations

from typing import NamedTuple

import torch
from torch import nn
from torch.nn import functional as F


class ShapeSpec(NamedTuple):
    """detectron2.layers.ShapeSpec — a simple (channels, height, width, stride) spec."""

    channels: int = None
    height: int = None
    width: int = None
    stride: int = None


class Conv2d(nn.Conv2d):
    """detectron2.layers.Conv2d — nn.Conv2d that also accepts `norm` and `activation`
    modules and applies them in forward(). This is the wrapper the model relies on;
    plain torch.nn.Conv2d rejects the `norm=` kwarg (the bug this shim fixes)."""

    def __init__(self, *args, **kwargs):
        norm = kwargs.pop("norm", None)
        activation = kwargs.pop("activation", None)
        super().__init__(*args, **kwargs)
        self.norm = norm
        self.activation = activation

    def forward(self, x):
        x = F.conv2d(
            x, self.weight, self.bias, self.stride,
            self.padding, self.dilation, self.groups,
        )
        if self.norm is not None:
            x = self.norm(x)
        if self.activation is not None:
            x = self.activation(x)
        return x


# DeformConv is imported by the FPN pixel decoder but not instantiated on the eval
# path used here. Alias to the regular Conv2d wrapper so the import resolves.
DeformConv = Conv2d


def get_norm(norm, out_channels):
    """detectron2.layers.get_norm — map a norm spec to a module (or None)."""
    if norm is None:
        return None
    if isinstance(norm, str):
        if len(norm) == 0:
            return None
        norm = {
            "GN": lambda c: nn.GroupNorm(32, c),
            "BN": nn.BatchNorm2d,
            "SyncBN": nn.BatchNorm2d,
            "nnSyncBN": nn.BatchNorm2d,
            "LN": lambda c: nn.GroupNorm(1, c),
        }.get(norm, nn.Identity if False else None)
        if norm is None:
            return nn.Identity()
    return norm(out_channels)


__all__ = ["ShapeSpec", "Conv2d", "DeformConv", "get_norm"]
