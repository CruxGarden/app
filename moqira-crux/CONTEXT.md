# Mockups App Context

Moqira is a desktop wireframing app. This context names the product concepts that should shape module seams and keep future architecture discussions consistent.

## Language

**Project**:
A saved mockups document containing wireframes, appearance settings, and the active wireframe pointer.
_Avoid_: document, file, workspace

**Wireframe**:
One screen-sized mockup inside a project, with a canvas background and an ordered stack of canvas nodes.
_Avoid_: page, artboard, screen

**Canvas Node**:
A placed wireframe control on a wireframe canvas. Canvas node order is the layer stack.
_Avoid_: component instance, shape, widget

**Control Catalogue**:
The set of available wireframe controls that can create canvas nodes.
_Avoid_: component library, palette

**Canvas Node Behavior**:
The semantic rules for a canvas node kind: creation defaults, editable fields, option parsing, property capabilities, link targets, and interactive affordances.
_Avoid_: component metadata, widget config, shape behavior
