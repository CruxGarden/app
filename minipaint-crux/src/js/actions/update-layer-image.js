import app from './../app.js';
import config from './../config.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';
import image_store from './store/image-store.js';
import { Base_action } from './base.js';


export class Update_layer_image_action extends Base_action {
	/**
	 * updates layer image data
	 *
	 * @param {canvas} canvas
	 * @param {int} layer_id (optional)
	 */
	constructor(canvas, layer_id) {
		super('update_layer_image', 'Update Layer Image');
		// Native callers may clear their temporary canvas before this async action runs.
		this.canvas_data_url = canvas ? canvas.toDataURL('image/png') : null;
		if (layer_id == null)
			layer_id = config.layer.id;
		this.layer_id = parseInt(layer_id);
		this.reference_layer = null;
		this.old_image_id = null;
		this.new_image_id = null;
		this.old_link_database_id = null;
	}

	async do() {
		super.do();
		this.reference_layer = app.Layers.get_layer(this.layer_id);
		if (!this.reference_layer) {
			throw new Error('Aborted - layer with specified id doesn\'t exist');
		}
		if (this.reference_layer.type != 'image'){
			alertify.error('Error: layer must be image.');
			throw new Error('Aborted - layer is not an image');
		}

		// Get data url representation of image
		let canvas_data_url;
		if (this.new_image_id) {
			try {
				canvas_data_url = await image_store.get(this.new_image_id);
			} catch (error) {
				throw new Error('Aborted - problem retrieving cached image from database');
			}
		} else {
			canvas_data_url = this.canvas_data_url;
		}

		// Store data url in database
		try {
			if (!this.old_image_id) {
				if (this.reference_layer._link_database_id) {
					this.old_image_id = this.reference_layer._link_database_id;
				} else {
					// Imported images can retain decoded pixels after their blob URL is revoked.
					const original = document.createElement('canvas');
					original.width = this.reference_layer.width_original;
					original.height = this.reference_layer.height_original;
					original.getContext('2d').drawImage(this.reference_layer.link, 0, 0);
					this.old_image_id = await image_store.add(original.toDataURL('image/png'));
				}
			}
			if (!this.new_image_id) {
				this.new_image_id = await image_store.add(canvas_data_url);
			}
		} catch (error) {
			throw new Error('Aborted - unable to preserve image Undo history');
		}

		// Estimate storage size
		try {
			this.database_estimate = new Blob([await image_store.get(this.old_image_id)]).size;
		} catch (e) {}

		// Assign layer properties
		this.reference_layer.link.src = canvas_data_url;
		await this.reference_layer.link.decode();
		this.old_link_database_id = this.reference_layer._link_database_id;
		this.reference_layer._link_database_id = this.new_image_id;

		this.canvas_data_url = null;
		config.need_render = true;
	}

	async undo() {
		super.undo();

		// Estimate storage size
		try {
			this.database_estimate = new Blob([this.reference_layer.link.src]).size;
		} catch (e) {}

		// Restore old image
		if (this.old_image_id != null) {
			try {
				this.reference_layer.link.src = await image_store.get(this.old_image_id);
				await this.reference_layer.link.decode();
			} catch (error) {
				throw new Error('Failed to retrieve image from store');
			}
		}
		this.reference_layer._link_database_id = this.old_link_database_id;
		this.reference_layer = null;
		config.need_render = true;
	}

	async free() {
		let has_error = false;
		if (this.new_image_id != null) {
			try {
				await image_store.delete(this.new_image_id);
			} catch (error) {
				has_error = true;
			}
			this.new_image_id = null;
		}
		if (this.is_done || !this.old_link_database_id) {
			if (this.old_image_id != null) {
				try {
					await image_store.delete(this.old_image_id);
				} catch (error) {
					has_error = true;
				}
				this.old_image_id = null;
			}
		}
		this.canvas_data_url = null;
		this.old_link_database_id = null;
		this.reference_layer = null;
		if (has_error) {
			alertify.error('A problem occurred while removing undo history. It\'s suggested you save your work and refresh the page in order to free up memory.');
		}
	}
}
