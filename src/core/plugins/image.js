import { Plugin, PluginKey } from 'prosemirror-state';
import { ReplaceStep } from 'prosemirror-transform';
import { schema } from '../schema';
import { SetAttrsStep } from '../utils';
import { getSingleSelectedNode } from '../commands';

class Image {
	constructor(state, options) {
		this.options = options;
		this.popup = { active: false };
	}

	update(state, oldState) {
		if (!this.view) {
			return;
		}

		let nodeData = getSingleSelectedNode(state, schema.nodes.image);
		if (nodeData) {
			let { node, pos } = nodeData;

			if (!node.attrs.annotation) {
				this.popup = { active: false };
				return;
			}

			let dom = this.view.nodeDOM(pos);

			this.popup = {
				active: true,
				node: dom,
				open: this.open.bind(this),
				unlink: this.unlink.bind(this)
			};
			return;
		}
		this.popup = { active: false };
	}

	open() {
		let nodeData = getSingleSelectedNode(this.view.state, schema.nodes.image);
		if (nodeData) {
			let { node } = nodeData;
			if (node.attrs.annotation) {
				this.options.onOpen(node.attrs.annotation);
			}
		}
	}

	unlink() {
		let { state, dispatch } = this.view;
		let { tr } = state;
		let nodeData = getSingleSelectedNode(state, schema.nodes.image);
		if (nodeData) {
			let { node, pos } = nodeData;
			tr.setNodeMarkup(pos, null, {
				...node.attrs,
				annotation: null
			});
			dispatch(tr);
		}
	}

	destroy() {
		this.popup = { active: false };
	}
}

// Allows to skip some clearly unsupported urls
function isUnsupported(src) {
	let supportedTypes = [
		'image/jpeg',
		'image/png'
	];

	let unsupportedExtensions = [
		'apng', 'avif', 'gif', 'svg', 'webp', 'bmp', 'ico', 'cur', 'tif', 'tiff'
	];

	if (src.startsWith('data:')) {
		return !supportedTypes.includes(src.slice(5).split(/[,;]/)[0])
	}

	return unsupportedExtensions.includes(src.split('.').pop());
}

export let imageKey = new PluginKey('image');

export function image(options) {
	let importedIDs = [];
	return new Plugin({
		key: imageKey,
		state: {
			init(config, state) {
				return new Image(state, options);
			},
			apply(tr, pluginState, oldState, newState) {
				return pluginState;
			}
		},
		view: (view) => {
			let pluginState = imageKey.getState(view.state);
			pluginState.view = view;
			return {
				update(view, lastState) {
					pluginState.update(view.state, lastState);
				},
				destroy() {
					pluginState.destroy();
				}
			};
		},
		appendTransaction(transactions, oldState, newState) {
			if ((!transactions.some(tr => tr.docChanged)
					|| transactions.some(tr => tr.getMeta('system')))
				&& !window.shortlyAllowImageImport
				&& !transactions.some(tr => tr.getMeta('autoImportImages'))) {
				return;
			}
			window.shortlyAllowImageImport = false;
			let images = [];
			newState.doc.descendants((node, pos) => {
				if (node.type.name === 'image') {
					let src = node.attrs.tempSrc || node.attrs.src;
					if (src
						&& !node.attrs.attachmentKey
						&& !importedIDs.includes(node.attrs.nodeID)
						&& !isUnsupported(src)) {
						images.push({ nodeID: node.attrs.nodeID, src });
						importedIDs.push(node.attrs.nodeID);
					}
				}
			});

			// TODO: Remove this limit
			if (images.length > 25
				&& transactions.some(tr => tr.getMeta('autoImportImages'))) {
				importedIDs = [];
				return;
			}

			if (images.length) {
				options.onImportImages(images);
			}
		}
	});
}
