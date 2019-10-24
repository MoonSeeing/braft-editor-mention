import 'draft-js/dist/Draft.css'
import 'assets/scss/_base.scss'
import React from 'react'
import languages from 'languages'
import BraftFinder from 'braft-finder'
import { ColorUtils, ContentUtils } from 'braft-utils'
import { Editor, EditorState } from 'draft-js'
import { Map } from 'immutable'
import getKeyBindingFn from 'configs/keybindings'
import SuggestionList from './../suggest';
import addSuggestion from './../suggest/addSuggestion';
import defaultProps from 'configs/props'
import { keyCommandHandlers, returnHandlers, beforeInputHandlers, dropHandlers, droppedFilesHandlers, copyHandlers, pastedFilesHandlers, pastedTextHandlers, compositionStartHandler } from 'configs/handlers'
import { getBlockRendererFn, getBlockRenderMap, getBlockStyleFn, getCustomStyleMap, getCustomStyleFn, getDecorators } from 'renderers'
import { compositeStyleImportFn, compositeStyleExportFn, compositeEntityImportFn, compositeEntityExportFn, compositeBlockImportFn, compositeBlockExportFn, getPropInterceptors } from 'helpers/extension'
import ControlBar from 'components/business/ControlBar'

const buildHooks = (hooks) => (hookName, defaultReturns = {}) => {
  return hooks[hookName] || (() => defaultReturns)
}

const filterColors = (colors, colors2) => {
  return colors.filter(item => {
    return !colors2.find(color => color.toLowerCase() === item.toLowerCase())
  }).filter((item, index, array) => array.indexOf(item) === index)
}

const isControlEnabled = (props, controlName) => {
  return [...props.controls, ...props.extendControls].find(item => item === controlName || item.key === controlName) && props.excludeControls.indexOf(controlName) === -1
}

const getConvertOptions = (props) => {

  const editorId = props.editorId || props.id
  const convertOptions = { ...defaultProps.converts, ...props.converts, fontFamilies: props.fontFamilies }

  convertOptions.styleImportFn = compositeStyleImportFn(convertOptions.styleImportFn, editorId)
  convertOptions.styleExportFn = compositeStyleExportFn(convertOptions.styleExportFn, editorId)
  convertOptions.entityImportFn = compositeEntityImportFn(convertOptions.entityImportFn, editorId)
  convertOptions.entityExportFn = compositeEntityExportFn(convertOptions.entityExportFn, editorId)
  convertOptions.blockImportFn = compositeBlockImportFn(convertOptions.blockImportFn, editorId)
  convertOptions.blockExportFn = compositeBlockExportFn(convertOptions.blockExportFn, editorId)

  return convertOptions

}

var  filteredArrayTemp;

export default class BraftEditor extends React.Component {

  static defaultProps = defaultProps

  constructor(props) {

    super(props)

    this.editorProps = this.getEditorProps(props)
    this.editorDecorators = getDecorators(this.editorProps.editorId || this.editorProps.id)
    this.autocompleteState = null;
    this.isFocused = false
    this.isLiving = false
    this.braftFinder = null
    this.valueInitialized = !!(this.props.defaultValue || this.props.value)

    const defaultEditorState = (this.props.defaultValue || this.props.value) instanceof EditorState
      ? (this.props.defaultValue || this.props.value)
      : EditorState.createEmpty(this.editorDecorators)
    defaultEditorState.setConvertOptions(getConvertOptions(this.editorProps))

    let tempColors = []

    if (ContentUtils.isEditorState(defaultEditorState)) {

      const colors = ColorUtils.detectColorsFromDraftState(defaultEditorState.toRAW(true))
      defaultEditorState.setConvertOptions(getConvertOptions(this.editorProps))

      tempColors = filterColors(colors, this.editorProps.colors)
    }

    this.state = {
      tempColors,
      editorState: defaultEditorState,
      isFullscreen: false,
      draftProps: {},
      autocompleteState: null,
    }
    this.containerNode = null
  }

  getEditorProps(props) {

    props = props || this.props

    const { value, defaultValue, onChange, ...restProps } = props// eslint-disable-line no-unused-vars
    const propInterceptors = getPropInterceptors(restProps.editorId || restProps.id)

    if (propInterceptors.length === 0) {
      return restProps
    }

    let porpsMap = Map(restProps)

    propInterceptors.forEach(interceptor => {
      porpsMap = porpsMap.merge(Map(interceptor(porpsMap.toJS(), this) || {}))
    })

    return porpsMap.toJS()

  }

  componentWillMount() {

    if (isControlEnabled(this.editorProps, 'media')) {

      const { language, media } = this.editorProps
      const { uploadFn, validateFn, items } = { ...defaultProps.media, ...media }

      this.braftFinder = new BraftFinder({
        items: items,
        language: language,
        uploader: uploadFn,
        validator: validateFn
      })

      this.forceUpdate()

    }

  }

  componentDidMount() {

    this.isLiving = true

  }

  componentDidUpdate(_, prevState) {

    if (prevState.editorState !== this.state.editorState) {
      this.state.editorState.setConvertOptions(getConvertOptions(this.editorProps))
    }

  }

  componentWillReceiveProps(props) {

    this.editorProps = this.getEditorProps(props)

    const { value: editorState } = props
    const { media, language } = this.editorProps
    const currentProps = this.getEditorProps()

    if (!isControlEnabled(currentProps, 'media') && isControlEnabled(this.editorProps, 'media') && !this.braftFinder) {

      const { uploadFn, validateFn, items } = { ...defaultProps.media, ...media }

      this.braftFinder = new BraftFinder({
        items: items,
        language: language,
        uploader: uploadFn,
        validator: validateFn
      })

      this.forceUpdate()

    }

    if (media && media.items && this.braftFinder) {
      this.braftFinder.setItems(media.items)
    }

    let nextEditorState

    if (!this.valueInitialized && typeof this.props.defaultValue === 'undefined' && ContentUtils.isEditorState(props.defaultValue)) {
      nextEditorState = props.defaultValue
    } else if (ContentUtils.isEditorState(editorState)) {
      nextEditorState = editorState
    }

    if (nextEditorState) {

      if (nextEditorState && nextEditorState !== this.state.editorState) {

        const tempColors = ColorUtils.detectColorsFromDraftState(nextEditorState.toRAW(true))
        nextEditorState.setConvertOptions(getConvertOptions(this.editorProps))

        this.setState({
          tempColors: filterColors([...this.state.tempColors, ...tempColors], currentProps.colors),
          editorState: nextEditorState
        }, () => {
          this.props.onChange && this.props.onChange(nextEditorState)
        })

      } else {
        this.setState({
          editorState: nextEditorState
        })
      }

    }

  }

  componentWillUnmount() {
    this.isLiving = false
    this.controlBarInstance && this.controlBarInstance.closeBraftFinder()
  }

  hasEntityAtSelection = (editorState) => {


    const selection = editorState.getSelection();
    if (!selection.getHasFocus()) {
      return false;
    }

    const contentState = editorState.getCurrentContent();
    const block = contentState.getBlockForKey(selection.getStartKey());
    return !!block.getEntityAt(selection.getStartOffset() - 1);
  };

  getAutocompleteRange = (editorState, trigger) => {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) {
      return null;
    }

    if (this.hasEntityAtSelection(editorState)) {
      return null;
    }

    const range = selection.getRangeAt(0);
    let text = range.startContainer.textContent;
    text = text.substring(0, range.startOffset);
    const index = text.lastIndexOf(trigger);
    if (index === -1) {
      return null;
    }
    text = text.substring(index);
    return {
      text,
      start: index,
      end: range.startOffset
    };
  };

  getAutocompleteState = (editorState, invalidate = true) => {
    if (!invalidate) {
      return this.autocompleteState;
    }

    var type = null;
    var trigger = null;
    // const tagRange = this.getAutocompleteRange(editorState, '#');
    const personRange = this.getAutocompleteRange(editorState, '@');
    if (!personRange) {
      this.autocompleteState = null;
      return null;
    }
    var range = personRange;
    type = 2;
    trigger = '@';
    // if (!tagRange) {
    //   range = personRange;
    //   type = 2;
    //   trigger = '@';
    // }

    // if (!personRange) {
    //   range = tagRange;
    //   type = 1;
    //   trigger = '#';
    // }

    if (!range) {
      range = tagRange.start > personRange.start ? tagRange : personRange;
      type = tagRange.start > personRange.start ? 1 : 2;
      trigger = tagRange.start > personRange.start ? '#' : '@';
    }
    let mentionText = range.text.substring(1, range.text.length);
    this.editorProps.onMentionChange(mentionText);
    const tempRange = window.getSelection().getRangeAt(0).cloneRange();
    tempRange.setStart(tempRange.startContainer, range.start);
    // const mark = document.createElement('mark');
    // tempRange.surroundContents(mark);
    const rangeRect = tempRange.getBoundingClientRect();
    let [left, top] = [rangeRect.left, rangeRect.bottom ];
    this.autocompleteState = {
      trigger,
      type,
      left,
      top,
      text: range.text,
      selectedIndex: 0
    };
    return this.autocompleteState;
  };

  onChange = (editorState, callback) => {
    if (!(editorState instanceof EditorState)) {
      editorState = EditorState.set(editorState, {
        decorator: this.editorDecorators
      })
    }

    if (!editorState.convertOptions) {
      editorState.setConvertOptions(getConvertOptions(this.editorProps))
    }

    this.setState({ editorState }, () => {
      this.props.onChange && this.props.onChange(editorState)
      callback && callback(editorState)
    })

    window.requestAnimationFrame(() => {
      this.setState({ autocompleteState: this.getAutocompleteState(editorState) });
    });
  }




  getFilteredArray = (type, text) => {
    const dataArray = [
      'Bruce Wayne',
      'Helga Pataki',
      'Lady Gaga',
      'Lana Del Rey',
      'Marilyn Monroe',
    ]
    return dataArray;
  }


  renderAutocomplete = () => {
    const {
      autocompleteState,
    } = this.state;
    if (!autocompleteState) {
      return null;
    }
    autocompleteState.array = this.props.mentions;
    autocompleteState.onSuggestionClick = this.onSuggestionItemClick;
    return <SuggestionList suggestionsState={
      autocompleteState
    }
    />
  };

  getDraftInstance = () => {
    return this.draftInstance
  }

  getFinderInstance = () => {
    return this.braftFinder
  }

  getValue = () => {
    return this.state.editorState
  }

  setValue = (editorState, callback) => {
    return this.onChange(editorState, callback)
  }

  forceRender = () => {

    const selectionState = this.state.editorState.getSelection()

    this.setValue(EditorState.set(this.state.editorState, {
      decorator: this.editorDecorators
    }), () => {
      this.setValue(EditorState.forceSelection(this.state.editorState, selectionState))
    })

  }

  normalizeIndex = (selectedIndex, max) => {
    let index = selectedIndex % max;
    if (index < 0) {
        index += max;
    }
    return index;
}

  onInsert = (insertState) => {
    if (!this.props.mentions) {
      return null;
    }
    const index = this.normalizeIndex(insertState.selectedIndex, this.props.mentions.length);
    if (isNaN(index)) {
      insertState.text =  insertState.text_temp;
    }else {
      insertState.text = insertState.trigger + this.props.mentions[index];
    }
    return addSuggestion(insertState);
  };

  getInsertState(selectedIndex, trigger) {
    const {
      editorState
    } = this.state;
    const currentSelectionState = editorState.getSelection();
    const end = currentSelectionState.getAnchorOffset();
    const anchorKey = currentSelectionState.getAnchorKey();
    const currentContent = editorState.getCurrentContent();
    const currentBlock = currentContent.getBlockForKey(anchorKey);
    const blockText = currentBlock.getText();
    const start = blockText.substring(0, end).lastIndexOf(trigger);
    return {
      editorState,
      start,
      end,
      trigger,
      selectedIndex,
      text_temp: blockText,
    }
  }

  onMentionSelect = () => {
    let autocompleteState = this.getAutocompleteState(this.state.editorState, false);
    const insertState = this.getInsertState(autocompleteState.selectedIndex, autocompleteState.trigger);
    const newEditorState = this.onInsert(insertState);
    this.props.onChange(newEditorState)
    // this.onChange(newEditorState);
  }


  commitSelection = (e) => {
    let autocompleteState = this.getAutocompleteState(this.state.editorState, false);
    if (!autocompleteState) {
      return false;
    }
    e.preventDefault();
    this.onMentionSelect();
    this.autocompleteState = null;
    this.setState({
      autocompleteState: null,
    })
    return true;
  };

  onTab = (event) => {

    if (keyCommandHandlers('tab', this.state.editorState, this) === 'handled') {
      event.preventDefault()
    }

    this.editorProps.onTab && this.editorProps.onTab(event)

  }

  onArrow = (e, originalHandler, nudgeAmount) => {
    let autocompleteState = this.getAutocompleteState(this.state.editorState, false);
    if (!autocompleteState) {
      if (originalHandler) {
        originalHandler(e);
      }
      return;
    }

    e.preventDefault();
    if (autocompleteState.selectedIndex + nudgeAmount >= 0 && autocompleteState.selectedIndex + nudgeAmount <= (this.props.mentions.length - 1)) {
      autocompleteState.selectedIndex += nudgeAmount;
      this.autocompleteState = autocompleteState;
      this.setState({
        autocompleteState
      })
    }
    
  }

  onUpArrow = (e) => {
    this.onArrow(e, this.editorProps.onUpArrow, -1);
  }

  onDownArrow = (e) => {
    this.onArrow(e, this.editorProps.onDownArrow, 1);
  }

  onFocus = () => {
    this.isFocused = true
    this.editorProps.onFocus && this.editorProps.onFocus(this.state.editorState)
  }

  onBlur = () => {
    this.isFocused = false
    this.editorProps.onBlur && this.editorProps.onBlur(this.state.editorState)
  }

  requestFocus = () => {
    setTimeout(() => this.draftInstance.focus(), 0)
  }

  handleKeyCommand = (command, editorState) => keyCommandHandlers(command, editorState, this)

  handleReturn = (event, editorState) => { returnHandlers(event, editorState, this) }

  handleBeforeInput = (chars, editorState) => beforeInputHandlers(chars, editorState, this)

  handleDrop = (selectionState, dataTransfer) => dropHandlers(selectionState, dataTransfer, this)

  handleDroppedFiles = (selectionState, files) => droppedFilesHandlers(selectionState, files, this)

  handlePastedFiles = (files) => pastedFilesHandlers(files, this)

  handleCopyContent = (event) => copyHandlers(event, this)

  handlePastedText = (text, html, editorState) => pastedTextHandlers(text, html, editorState, this)

  handleCompositionStart = (event) => compositionStartHandler(event, this)

  undo = () => {
    this.setValue(ContentUtils.undo(this.state.editorState))
  }

  redo = () => {
    this.setValue(ContentUtils.redo(this.state.editorState))
  }

  removeSelectionInlineStyles = () => {
    this.setValue(ContentUtils.removeSelectionInlineStyles(this.state.editorState))
  }

  insertHorizontalLine = () => {
    this.setValue(ContentUtils.insertHorizontalLine(this.state.editorState))
  }

  clearEditorContent = () => {
    this.setValue(ContentUtils.clear(this.state.editorState), (editorState) => {
      this.setValue(ContentUtils.toggleSelectionIndent(editorState, 0))
    })
  }

  toggleFullscreen = (fullscreen) => {

    this.setState({
      isFullscreen: typeof fullscreen !== 'undefined' ? fullscreen : !this.state.isFullscreen
    }, () => {
      this.editorProps.onFullscreen && this.editorProps.onFullscreen(this.state.isFullscreen)
    })

  }

  lockOrUnlockEditor(editorLocked) {
    this.setState({ editorLocked })
  }

  setEditorContainerNode = (containerNode) => {
    this.containerNode = containerNode
  }

  render() {

    let {
      id, editorId, controls, excludeControls, extendControls, readOnly, disabled, media, language, colors, colorPicker, colorPickerTheme, colorPickerAutoHide, hooks,
      fontSizes, fontFamilies, emojis, placeholder, fixPlaceholder, headings, imageControls, imageResizable, lineHeights, letterSpacings, textAligns, textBackgroundColor, allowInsertLinkText, defaultLinkTarget,
      extendAtomics, className, style, controlBarClassName, controlBarStyle, contentClassName, contentStyle, stripPastedStyles, componentBelowControlBar
    } = this.editorProps
    const { isFullscreen, editorState } = this.state

    editorId = editorId || id
    hooks = buildHooks(hooks)
    controls = controls.filter(item => excludeControls.indexOf(item) === -1)
    language = (typeof language === 'function' ? language(languages, 'braft-editor') : languages[language]) || languages[defaultProps.language]

    const externalMedias = media && media.externals ? {
      ...defaultProps.media.externals,
      ...media.externals
    } : defaultProps.media.externals

    const accepts = media && media.accepts ? {
      ...defaultProps.media.accepts,
      ...media.accepts
    } : defaultProps.media.accepts

    media = { ...defaultProps.media, ...media, externalMedias, accepts }

    if (!media.uploadFn) {
      media.video = false
      media.audio = false
    }

    const controlBarProps = {
      editor: this,
      editorState: editorState,
      braftFinder: this.braftFinder,
      ref: instance => this.controlBarInstance = instance,
      getContainerNode: () => this.containerNode,
      className: controlBarClassName,
      style: controlBarStyle,
      colors: [...colors, ...this.state.tempColors],
      colorPicker, colorPickerTheme, colorPickerAutoHide, hooks, editorId, media, controls, language, extendControls, headings, fontSizes, fontFamilies,
      emojis, lineHeights, letterSpacings, textAligns, textBackgroundColor, allowInsertLinkText, defaultLinkTarget
    }

    const { unitExportFn } = editorState.convertOptions

    const commonProps = {
      editor: this, editorId, hooks,
      editorState: editorState,
      containerNode: this.containerNode,
      imageControls, imageResizable, language, extendAtomics
    }

    const blockRendererFn = getBlockRendererFn(commonProps, this.editorProps.blockRendererFn)
    const blockRenderMap = getBlockRenderMap(commonProps, this.editorProps.blockRenderMap)
    const blockStyleFn = getBlockStyleFn(this.editorProps.blockStyleFn)
    const customStyleMap = getCustomStyleMap(commonProps, this.editorProps.customStyleMap)
    const customStyleFn = getCustomStyleFn(commonProps, { fontFamilies, unitExportFn, customStyleFn: this.editorProps.customStyleFn })

    const keyBindingFn = getKeyBindingFn(this.editorProps.keyBindingFn)

    const mixedProps = {}

    if (this.state.editorLocked || this.editorProps.disabled || this.editorProps.readOnly || this.editorProps.draftProps.readOnly) {
      mixedProps.readOnly = true
    }

    if (
      placeholder && fixPlaceholder && editorState.isEmpty() &&
      editorState.getCurrentContent().getFirstBlock().getType() !== 'unstyled'
    ) {
      placeholder = ''
    }

    const draftProps = {
      ref: instance => { this.draftInstance = instance },
      editorState: editorState,
      handleKeyCommand: this.handleKeyCommand,
      handleReturn: this.handleReturn,
      handleBeforeInput: this.handleBeforeInput,
      handleDrop: this.handleDrop,
      handleDroppedFiles: this.handleDroppedFiles,
      handlePastedText: this.handlePastedText,
      handlePastedFiles: this.handlePastedFiles,
      onChange: this.onChange,
      onUpArrow: this.onUpArrow,
      onDownArrow: this.onDownArrow,
      onTab: this.onTab,
      onFocus: this.onFocus,
      onBlur: this.onBlur,
      blockRenderMap, blockRendererFn, blockStyleFn,
      customStyleMap, customStyleFn,
      keyBindingFn, placeholder, stripPastedStyles,
      ...this.editorProps.draftProps,
      ...mixedProps
    }

    return (
      <React.Fragment>
        {this.renderAutocomplete()}
        <div
          id='editor'
          style={style}
          ref={this.setEditorContainerNode}
          className={`bf-container ${className}${(disabled ? ' disabled' : '')}${(readOnly ? ' read-only' : '')}${isFullscreen ? ' fullscreen' : ''}`}
        >
          <ControlBar {...controlBarProps} />
          {componentBelowControlBar}

          <div
            onCompositionStart={this.handleCompositionStart}
            className={`bf-content ${contentClassName}`}
            onCopy={this.handleCopyContent}
            style={contentStyle}
          >

            <Editor {...draftProps} />
          </div>
        </div>
      </React.Fragment>
    )

  }

}

export { EditorState }