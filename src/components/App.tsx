import React, {
	useCallback,
	useLayoutEffect,
	useMemo,
	useReducer,
	useRef,
} from "react"

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

	// TODO:
	// - how to set the title of the tabbar without breaking encapsulation
	// - how to save the state to localStorage?
	// - UI for changing tabs, etc.
	// - declarative keyboard effects? like elmish

	const editorState = state.currentTab
	const editorDispatch = useCallback((action: EditorAction) => {
		dispatch({ type: "edit-tab", action })
	}, [])

	return (
		<div>
			<Tabbar state={state} dispatch={dispatch} />
			<Toolbar dispatch={dispatch} />
			<EditorComponent state={editorState} dispatch={editorDispatch} />
		</div>
	)
}

function Toolbar(props: { dispatch: (action: TabbedEditorsAction) => void }) {
	const { dispatch } = props

	const handleNewTab = useCallback(() => dispatch({ type: "new-tab" }), [])

	return (
		<div style={{ display: "flex" }}>
			<button style={{ margin: 4 }} onClick={handleNewTab}>
				New Tab
			</button>
		</div>
	)
}

function Tabbar(props: {
	state: TabbedEditorsState
	dispatch: (action: TabbedEditorsAction) => void
}) {
	const { state, dispatch } = props

	const leftTabs = state.leftTabs.map((tab, i, list) => {
		// length 3 list
		// 0 -> -3
		// 1 -> -2
		// 2 -> -1
		const direction = i - list.length
		return (
			<TabButton
				key={direction}
				index={i}
				direction={direction}
				dispatch={dispatch}
			/>
		)
	})

	const currentTab = (
		<TabButton
			key={0}
			index={state.leftTabs.length}
			direction={0}
			dispatch={dispatch}
		/>
	)

	const rightTabs = state.rightTabs.map((tab, i, list) => {
		const direction = i + 1
		return (
			<TabButton
				key={direction}
				index={state.leftTabs.length + 1 + i}
				direction={direction}
				dispatch={dispatch}
			/>
		)
	})

	return (
		<div style={{ display: "flex" }}>
			{leftTabs}
			{currentTab}
			{rightTabs}
		</div>
	)
}

function TabButton(props: {
	index: number
	direction: number
	dispatch: (action: TabbedEditorsAction) => void
}) {
	const { index, direction, dispatch } = props

	const handleClick = useCallback(() => {
		dispatch({ type: "change-tab", direction: direction })
	}, [direction])

	return (
		<button
			style={{
				border: direction === 0 ? "1px solid orange" : undefined,
				margin: 4,
			}}
			onClick={handleClick}
		>
			Tab {index}
		</button>
	)
}

export function EditorComponent(props: {
	state: EditorState
	dispatch: (action: EditorAction) => void
}) {
	const nodeRef = useRef<HTMLDivElement | null>(null)

	const viewRef = useRef<EditorView | null>(null)
	useLayoutEffect(() => {
		const view = new EditorView(nodeRef.current!, props.state, props.dispatch)
		viewRef.current = view
		return () => view.destroy()
	}, [props.dispatch])

	useLayoutEffect(() => {
		viewRef.current?.updateState(props.state)
	}, [viewRef.current, props.state])

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

class EditorView {
	private textArea: HTMLTextAreaElement

	constructor(
		private node: HTMLElement,
		public state: EditorState,
		public dispatch: (this: EditorView, action: EditorAction) => void
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

	public destroy() {
		this.textArea.removeEventListener("change", this.handleChange)
		this.node.removeChild(this.textArea)
	}
}
