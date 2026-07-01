"""detectron2.modeling shim — SEM_SEG_HEADS_REGISTRY and Backbone."""
from __future__ import annotations

from torch import nn

from detectron2.layers import ShapeSpec


class Registry:
    """Minimal stand-in for fvcore/detectron2 Registry: supports use as a decorator
    via .register() (with or without parens) and .get(name)."""

    def __init__(self, name: str):
        self._name = name
        self._obj_map: dict[str, object] = {}

    def register(self, obj=None):
        if obj is None:  # used as @registry.register()
            def deco(func_or_class):
                self._obj_map[func_or_class.__name__] = func_or_class
                return func_or_class
            return deco
        # used as @registry.register
        self._obj_map[obj.__name__] = obj
        return obj

    def get(self, name: str):
        return self._obj_map[name]

    def __getitem__(self, name: str):
        return self._obj_map[name]

    def __contains__(self, name: str):
        return name in self._obj_map


SEM_SEG_HEADS_REGISTRY = Registry("SEM_SEG_HEADS")


class Backbone(nn.Module):
    """detectron2.modeling.Backbone base — an nn.Module with the size/padding hooks
    detectron2 backbones expose. Subclasses define forward()/output_shape()."""

    def __init__(self):
        super().__init__()

    @property
    def size_divisibility(self) -> int:
        return 0

    @property
    def padding_constraints(self) -> dict:
        return {}

    def output_shape(self):
        return {
            name: ShapeSpec(
                channels=self._out_feature_channels[name],
                stride=self._out_feature_strides[name],
            )
            for name in getattr(self, "_out_features", [])
        }


__all__ = ["Registry", "SEM_SEG_HEADS_REGISTRY", "Backbone"]
