import app from './../app.js';
import config from './../config.js';
import { Base_action } from './base.js';

export class Add_layer_filter_action extends Base_action {
	/**
	 * register new live filter
	 *
	 * @param {int} layer_id
	 * @param {string} name
	 * @param {object} params
	 */
	constructor(layer_id, name, params, filter_id) {
		super('add_layer_filter', 'Add Layer Filter');
		if (layer_id == null)
			layer_id = config.layer.id;
		this.layer_id = parseInt(layer_id);
		this.name = name;
		this.params = params;
		// Native dialog data attributes are strings; keep persisted filter IDs numeric.
		this.filter_id = filter_id == null ? null : Number(filter_id);
		this.reference_layer = null;
		this.old_filters = null;
		this.inserted_id = null;
	}

	async do() {
		super.do();
		this.reference_layer = app.Layers.get_layer(this.layer_id);
		if (!this.reference_layer) {
			throw new Error('Aborted - layer with specified id doesn\'t exist');
		}
		const filters = this.reference_layer.filters;
		if (this.filter_id != null && (!Number.isSafeInteger(this.filter_id) || this.filter_id < 1))
			throw new Error('Aborted - filter with specified id does not exist');
		const index = filters.findIndex(filter => filter.id == this.filter_id);
		if (this.filter_id && index < 0)
			throw new Error('Aborted - filter with specified id does not exist');
		this.old_filters = structuredClone(filters);
		if (!this.filter_id && this.inserted_id == null) {
			this.inserted_id = 1;
			while (filters.some(filter => Number(filter.id) === this.inserted_id)) this.inserted_id++;
		}
		const filter = {
			id: this.filter_id || this.inserted_id,
			name: this.name,
			params: structuredClone(this.params),
		};
		if (this.filter_id) filters[index] = filter;
		else filters.push(filter);
		config.need_render = true;
		app.GUI.GUI_layers.render_layers();
	}

	async undo() {
		super.undo();
		if (this.reference_layer) {
			this.reference_layer.filters = this.old_filters;
			this.old_filters = null;
			this.reference_layer = null;
		}
		config.need_render = true;
		app.GUI.GUI_layers.render_layers();
	}

	free() {
		this.reference_layer = null;
		this.params = null;
		this.old_filters = null;
	}
}
