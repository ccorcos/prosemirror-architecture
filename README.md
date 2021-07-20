# ProseMirror-like Frontend Architecture

Goal:
Since I'm already using ProseMirror, what if we were to model an entire application with a similar
style for state management a'la Elm Architecture.

TODO:
- thoughts on making EditorState not a class? then we wouldn't need this whole "save" thing.
  its an interesting mix between functional and object-oriented. Not a bad thing necessarily,
  but where's the line?
- I can imagine a similar architecture for other side-effects as well. Similar to React itself
  declaring the HTML side-effect, we can do something similar where we "render" the keyboard
  effects that we want... I wonder how useful that would be.

