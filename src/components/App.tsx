import React, {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useReducer,
	useRef,
} from "react"

// ==================================================================
// Tab-based Editor with top-Level state.
// ==================================================================

interface StateMachine<A, D> {
	apply(action: A): this
	toJSON(): D
}

// Ew
type StateMachineJSON<S extends StateMachine<any, any>> = ReturnType<
	S["toJSON"]
>

// Very ew
type StateMachineAction<S extends StateMachine<any, any>> = Parameters<
	S["apply"]
>[0]

// ==================================================================
// Mock of ProseMirror EditorState
// ==================================================================

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

// ==================================================================
// TabState
// ==================================================================

type TabStateJSON = {
	title: string
	editorState: EditorStateJSON
}

type TabAction = { type: "edit-tab"; action: EditorAction }

class TabState {
	public title: string
	public editorState: EditorState

	constructor(args: { title: string; editorState: EditorState }) {
		this.title = args.title
		this.editorState = args.editorState
	}

	toJSON(): TabStateJSON {
		return {
			title: this.title,
			editorState: this.editorState.toJSON(),
		}
	}

	apply(action: TabAction): TabState {
		const editorState = this.editorState.apply(action.action)

		let title = editorState.text.split("\n")[0] || "Untitled"
		if (title.length > 10) title = title.slice(0, 10) + "..."

		return new TabState({ title, editorState })
	}

	static empty() {
		return new TabState({
			title: "",
			editorState: new EditorState(""),
		})
	}

	static fromJSON(json: TabStateJSON): TabState {
		return new TabState({
			title: json.title,
			editorState: EditorState.fromJSON(json.editorState),
		})
	}
}

// ==================================================================
// TabbedEditors
// ==================================================================

type TabbedEditorsStateJSON = {
	leftTabs: TabStateJSON[]
	currentTab: TabStateJSON
	rightTabs: TabStateJSON[]
}

type TabbedEditorAction =
	| { type: "edit-tab"; action: EditorAction }
	| { type: "change-tab"; direction: number }
	| { type: "new-tab" }
	| { type: "close-tab"; direction: number }

class TabbedEditorState {
	public leftTabs: TabState[]
	public currentTab: TabState
	public rightTabs: TabState[]

	constructor(args: {
		leftTabs: TabState[]
		currentTab: TabState
		rightTabs: TabState[]
	}) {
		this.leftTabs = args.leftTabs
		this.currentTab = args.currentTab
		this.rightTabs = args.rightTabs
	}

	apply(action: TabbedEditorAction): TabbedEditorState {
		switch (action.type) {
			case "change-tab":
				return this.changeTab(action.direction)
			case "close-tab":
				return this.closeTab(action.direction)
			case "new-tab":
				return this.newTab()
			case "edit-tab": {
				return new TabbedEditorState({
					leftTabs: this.leftTabs,
					rightTabs: this.rightTabs,
					currentTab: this.currentTab.apply(action),
				})
			}
		}
	}

	toJSON(): TabbedEditorsStateJSON {
		return {
			leftTabs: this.leftTabs.map((s) => s.toJSON()),
			currentTab: this.currentTab.toJSON(),
			rightTabs: this.rightTabs.map((s) => s.toJSON()),
		}
	}

	static empty() {
		return new TabbedEditorState({
			leftTabs: [],
			rightTabs: [],
			currentTab: TabState.empty(),
		})
	}

	static fromJSON(json: TabbedEditorsStateJSON) {
		return new TabbedEditorState({
			leftTabs: json.leftTabs.map(TabState.fromJSON),
			rightTabs: json.rightTabs.map(TabState.fromJSON),
			currentTab: TabState.fromJSON(json.currentTab),
		})
	}

	private newTab() {
		return new TabbedEditorState({
			leftTabs: [...this.leftTabs, this.currentTab],
			currentTab: TabState.empty(),
			rightTabs: this.rightTabs,
		})
	}

	private closeTab(direction: number) {
		if (direction === 0) {
			return this.closeCurrentTab()
		}

		if (direction > 0) {
			const rightTabs = [...this.rightTabs]
			rightTabs.splice(direction - 1, 1)
			return new TabbedEditorState({
				leftTabs: this.leftTabs,
				currentTab: this.currentTab,
				rightTabs,
			})
		}

		const leftTabs = [...this.leftTabs]
		leftTabs.reverse()
		leftTabs.splice(-1 * direction - 1, 1)
		leftTabs.reverse()
		return new TabbedEditorState({
			leftTabs,
			currentTab: this.currentTab,
			rightTabs: this.rightTabs,
		})
	}

	private closeCurrentTab() {
		if (this.rightTabs.length > 0) {
			return new TabbedEditorState({
				leftTabs: this.leftTabs,
				currentTab: this.rightTabs[0],
				rightTabs: this.rightTabs.slice(1),
			})
		} else if (this.leftTabs.length > 0) {
			return new TabbedEditorState({
				leftTabs: this.leftTabs.slice(0, -1),
				currentTab: this.leftTabs[this.leftTabs.length - 1],
				rightTabs: [],
			})
		} else {
			return TabbedEditorState.empty()
		}
	}

	private changeTab(direction: number) {
		if (direction > 0) {
			let state: TabbedEditorState = this
			while (direction > 0) {
				state = state.changeTabRight()
				direction -= 1
			}
			return state
		}
		if (direction < 0) {
			let state: TabbedEditorState = this
			while (direction < 0) {
				state = state.changeTabLeft()
				direction += 1
			}
			return state
		}
		return this
	}

	protected changeTabLeft() {
		if (this.leftTabs.length === 0) return this
		const newCurrentTab = this.leftTabs[this.leftTabs.length - 1]
		const remainingLeftTabs = this.leftTabs.slice(0, -1)
		const newRightTabs = [this.currentTab, ...this.rightTabs]
		return new TabbedEditorState({
			leftTabs: remainingLeftTabs,
			currentTab: newCurrentTab,
			rightTabs: newRightTabs,
		})
	}

	protected changeTabRight() {
		if (this.rightTabs.length === 0) return this
		const newCurrentTab = this.rightTabs[0]
		const remainingRightTabs = this.rightTabs.slice(1)
		const newLeftTabs = [...this.leftTabs, this.currentTab]
		return new TabbedEditorState({
			leftTabs: newLeftTabs,
			currentTab: newCurrentTab,
			rightTabs: remainingRightTabs,
		})
	}
}

function useStateMachine<S extends StateMachine<any, any>>(initialState: S) {
	const [state, dispatch] = useReducer(
		(state: S, action: StateMachineAction<S>) => state.apply(action),
		initialState
	)
	return [state, dispatch] as const
}

const localStorageKey = "data3"

export function App() {
	const initialStateJson = useMemo(
		() => JSON.parse(localStorage.getItem(localStorageKey)!),
		[]
	)

	const initialState = initialStateJson
		? TabbedEditorState.fromJSON(initialStateJson)
		: TabbedEditorState.empty()

	const [state, dispatch] = useStateMachine(initialState)

	useEffect(() => {
		localStorage.setItem(localStorageKey, JSON.stringify(state.toJSON()))
	}, [state])

	const editorState = state.currentTab.editorState
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

function Toolbar(props: { dispatch: (action: TabbedEditorAction) => void }) {
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
	state: TabbedEditorState
	dispatch: (action: TabbedEditorAction) => void
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
				title={tab.title}
				direction={direction}
				dispatch={dispatch}
			/>
		)
	})

	const currentTab = (
		<TabButton
			key={0}
			title={state.currentTab.title}
			direction={0}
			dispatch={dispatch}
		/>
	)

	const rightTabs = state.rightTabs.map((tab, i, list) => {
		const direction = i + 1
		return (
			<TabButton
				key={direction}
				title={tab.title}
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
	title: string
	direction: number
	dispatch: (action: TabbedEditorAction) => void
}) {
	const { title, direction, dispatch } = props

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
			{title || "Untitled"}
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
// Mock of ProseMirror EditorView
// ==================================================================

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
		this.textArea.addEventListener("input", this.handleChange)
	}

	private handleChange = () => {
		this.dispatch({ type: "change", text: this.textArea.value })
	}

	public updateState(state: EditorState) {
		this.state = state
		this.textArea.value = state.text
	}

	public destroy() {
		this.textArea.removeEventListener("input", this.handleChange)
		this.node.removeChild(this.textArea)
	}
}
