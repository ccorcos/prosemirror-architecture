import React, { useLayoutEffect, useMemo, useReducer, useRef } from "react"

// Goal:
// What if I modeled by entire application in this Elm/ProseMirror/Redux sort of way?

// TODO:
// - thoughts on making EditorState not a class? then we wouldn't need this whole "save" thing.
//   its an interesting mix between functional and object-oriented. Not a bad thing necessarily,
//   but where's the line?

// ==================================================================
// Tab-based Editor with top-Level state.
// ==================================================================

type StateMachine<S, A, D> = {
	init: (data?: D) => S
	update: (state: S, action: A) => S
	save: (state: S) => D
}

type TabbedEditorsState = {
	leftTabs: EditorState[]
	currentTab: EditorState
	rightTabs: EditorState[]
}

type TabbedEditorsStateJSON = {
	leftTabs: EditorStateJSON[]
	currentTab: EditorStateJSON
	rightTabs: EditorStateJSON[]
}

type TabbedEditorsAction =
	| { type: "edit-tab"; action: EditorAction }
	| { type: "change-tab"; direction: number }
	| { type: "new-tab" }
	| { type: "close-tab"; direction: number }

const TabbedEditorsMachine: StateMachine<
	TabbedEditorsState,
	TabbedEditorsAction,
	TabbedEditorsStateJSON
> = {
	init: (json) => {
		if (!json)
			return {
				leftTabs: [],
				rightTabs: [],
				currentTab: EditorStateMachine.init(),
			}
		return {
			leftTabs: json.leftTabs.map(EditorState.fromJSON),
			rightTabs: json.rightTabs.map(EditorState.fromJSON),
			currentTab: EditorState.fromJSON(json.currentTab),
		}
	},
	update: (state, action) => {
		switch (action.type) {
			case "change-tab":
				return changeTab(state, action.direction)
			case "close-tab":
				return closeTab(state, action.direction)
			case "new-tab":
				return newTab(state)
			case "edit-tab":
				return {
					...state,
					currentTab: EditorStateMachine.update(
						state.currentTab,
						action.action
					),
				}
		}
	},
	save: (state) => {
		return {
			leftTabs: state.leftTabs.map((s) => s.toJSON()),
			currentTab: state.currentTab.toJSON(),
			rightTabs: state.rightTabs.map((s) => s.toJSON()),
		}
	},
}

function newTab(state: TabbedEditorsState): TabbedEditorsState {
	return {
		leftTabs: [...state.leftTabs, state.currentTab],
		currentTab: EditorStateMachine.init(),
		rightTabs: state.rightTabs,
	}
}

function closeTab(state: TabbedEditorsState, direction: number) {
	if (direction === 0) {
		return closeCurrentTab(state)
	}

	if (direction > 0) {
		const rightTabs = [...state.rightTabs]
		rightTabs.splice(direction - 1, 1)
		return { ...state, rightTabs }
	}

	const leftTabs = [...state.leftTabs]
	leftTabs.reverse()
	leftTabs.splice(-1 * direction - 1, 1)
	leftTabs.reverse()
	return { ...state, leftTabs }
}

function closeCurrentTab(state: TabbedEditorsState): TabbedEditorsState {
	if (state.rightTabs.length > 0) {
		return {
			leftTabs: state.leftTabs,
			currentTab: state.rightTabs[0],
			rightTabs: state.rightTabs.slice(1),
		}
	} else if (state.leftTabs.length > 0) {
		return {
			leftTabs: state.leftTabs.slice(0, -1),
			currentTab: state.leftTabs[state.leftTabs.length - 1],
			rightTabs: [],
		}
	} else {
		return {
			leftTabs: [],
			rightTabs: [],
			currentTab: EditorStateMachine.init(),
		}
	}
}

function changeTab(state: TabbedEditorsState, direction: number) {
	if (direction > 0) {
		while (direction > 0) {
			state = changeTabRight(state)
			direction -= 1
		}
		return state
	}
	if (direction < 0) {
		while (direction < 0) {
			state = changeTabLeft(state)
			direction += 1
		}
		return state
	}
	return state
}

function changeTabLeft(state: TabbedEditorsState): TabbedEditorsState {
	if (state.leftTabs.length === 0) return state
	const newCurrentTab = state.leftTabs[state.leftTabs.length - 1]
	const remainingLeftTabs = state.leftTabs.slice(0, -1)
	const newRightTabs = [state.currentTab, ...state.rightTabs]
	return {
		leftTabs: remainingLeftTabs,
		currentTab: newCurrentTab,
		rightTabs: newRightTabs,
	}
}

function changeTabRight(state: TabbedEditorsState): TabbedEditorsState {
	if (state.rightTabs.length === 0) return state
	const newCurrentTab = state.rightTabs[0]
	const remainingRightTabs = state.rightTabs.slice(1)
	const newLeftTabs = [...state.leftTabs, state.currentTab]
	return {
		leftTabs: newLeftTabs,
		currentTab: newCurrentTab,
		rightTabs: remainingRightTabs,
	}
}

function useStateMachine<S, A, D>(machine: StateMachine<S, A, D>, json?: D) {
	const initialState = useMemo(() => machine.init(json), [])
	const [state, dispatch] = useReducer(machine.update, initialState)
	return [state, dispatch] as const
}

export function App() {
	const [state, dispatch] = useStateMachine(TabbedEditorsMachine)

	return <EditorComponent />
}

export function EditorComponent() {
	const nodeRef = useRef<HTMLDivElement | null>(null)

	useLayoutEffect(() => {
		const state = new EditorState("")
		const view = new Editor(nodeRef.current!, state, function (action) {
			const nextState = this.state.apply(action)
			this.updateState(nextState)
		})
	})

	return <div ref={nodeRef} style={{ height: 400, width: 300 }} />
}

// ==================================================================
// ProseMirror Editor Mock
// ==================================================================

const EditorStateMachine: StateMachine<
	EditorState,
	EditorAction,
	EditorStateJSON
> = {
	init: (json) => (json ? EditorState.fromJSON(json) : new EditorState("")),
	update: (state, action) => state.apply(action),
	save: (state) => state.toJSON(),
}

type EditorStateJSON = { text: string }

type EditorAction = { type: "change"; text: string }

class EditorState {
	constructor(public text: string) {}

	apply(action: EditorAction) {
		return new EditorState(action.text)
	}

	toJSON(): EditorStateJSON {
		return { text: this.text }
	}

	static fromJSON(json: EditorStateJSON) {
		return new EditorState(json.text)
	}
}

class Editor {
	private textArea: HTMLTextAreaElement

	constructor(
		node: HTMLElement,
		public state: EditorState,
		public dispatch: (this: Editor, action: EditorAction) => void
	) {
		this.textArea = document.createElement("textarea")
		this.textArea.style.height = "100%"
		this.textArea.style.width = "100%"
		this.textArea.value = state.text
		node.appendChild(this.textArea)
		this.textArea.addEventListener("change", this.handleChange)
	}

	private handleChange = () => {
		this.dispatch({ type: "change", text: this.textArea.value })
	}

	public updateState(state: EditorState) {
		this.state = state
		this.textArea.value = state.text
	}
}
