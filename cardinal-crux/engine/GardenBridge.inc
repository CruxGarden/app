/* Crux Garden Cardinal bridge. SPDX-License-Identifier: GPL-3.0-or-later */
// Compiled into CardinalPlugin.cpp. The browser wrapper owns these two fixed virtual paths.
extern "C" EMSCRIPTEN_KEEPALIVE const char* garden_call(const char* request) {
    static std::string response;
    json_t* input = nullptr;
    json_t* result = nullptr;
    try {
        if (!gardenPlugin) throw std::runtime_error("Cardinal is not ready.");
        const ScopedContext sc(gardenPlugin);
        auto* context = gardenPlugin->context;
        if (!context->scene || !context->patch) throw std::runtime_error("Cardinal's rack is not ready.");
        json_error_t parseError;
        input = json_loads(request, JSON_REJECT_DUPLICATES, &parseError);
        if (!json_is_object(input)) throw std::runtime_error("Invalid engine request.");
        const char* operation = json_string_value(json_object_get(input, "op"));
        if (!operation) throw std::runtime_error("Missing engine operation.");
        const std::string op(operation);
        result = json_object();
        if (op == "describe") {
            json_t* patch = context->patch->toJson();
            json_object_del(patch, "path");
            json_object_del(patch, "unsaved");
            json_object_set_new(result, "patch", patch);
        } else if (op == "save") {
            rack::system::createDirectories("/userfiles");
            json_t* patch = context->patch->toJson();
            const int written = json_dump_file(patch, "/userfiles/garden-save.vcv", JSON_INDENT(2));
            json_decref(patch);
            if (written) throw std::runtime_error("Could not save the patch.");
            json_object_set_new(result, "path", json_string("/userfiles/garden-save.vcv"));
        } else if (op == "load") {
            json_error_t fileError;
            json_t* incoming = json_load_file("/userfiles/garden-load.vcv", JSON_REJECT_DUPLICATES, &fileError);
            if (!incoming) throw std::runtime_error("Choose an uncompressed Cardinal patch.");
            json_t* modules = json_object_get(incoming, "modules");
            if (!json_is_array(modules) || json_array_size(modules) > 128) { json_decref(incoming); throw std::runtime_error("Invalid patch module list."); }
            try {
                size_t index; json_t* module;
                json_array_foreach(modules, index, module) {
                    const char* plugin = json_string_value(json_object_get(module, "plugin"));
                    const char* model = json_string_value(json_object_get(module, "model"));
                    if (!plugin || !model || !rack::plugin::getModel(plugin, model)) throw std::runtime_error("This patch requires an unavailable module.");
                }
            } catch (...) { json_decref(incoming); throw; }
            json_decref(incoming);
            // Preserve the live patch if the incoming file fails or requires unavailable modules.
            json_t* recovery = context->patch->toJson();
            const int written = json_dump_file(recovery, "/userfiles/garden-recovery.vcv", JSON_INDENT(2));
            json_decref(recovery);
            if (written) throw std::runtime_error("Could not preserve the current patch.");
            try {
                context->patch->load("/userfiles/garden-load.vcv");
                if (!context->patch->warningLog.empty()) throw std::runtime_error(context->patch->warningLog);
            } catch (...) {
                context->patch->load("/userfiles/garden-recovery.vcv");
                throw;
            }
        } else if (op == "parameters") {
            json_t* changes = json_object_get(input, "changes");
            if (!json_is_array(changes) || json_array_size(changes) > 64) throw std::runtime_error("Invalid parameter changes.");
            struct Change { rack::engine::Module* module; int index; float value; };
            std::vector<Change> validated;
            size_t i; json_t* change;
            json_array_foreach(changes, i, change) {
                json_t* id = json_object_get(change, "moduleId");
                json_t* index = json_object_get(change, "paramId");
                json_t* value = json_object_get(change, "value");
                if (!json_is_integer(id) || !json_is_integer(index) || !json_is_number(value)) throw std::runtime_error("Invalid parameter address or value.");
                auto* module = context->engine->getModule(json_integer_value(id));
                const auto parameter = json_integer_value(index);
                if (!module || parameter < 0 || size_t(parameter) >= module->params.size()) throw std::runtime_error("A mapped module or control was removed. Reconnect the instrument control.");
                const auto* quantity = module->getParamQuantity(parameter);
                const double number = json_number_value(value);
                if (!quantity || !std::isfinite(number) || number < quantity->minValue || number > quantity->maxValue) throw std::runtime_error("Parameter is outside its supported range.");
                validated.push_back({module, int(parameter), float(number)});
            }
            for (const auto& change : validated) context->engine->setParamValue(change.module, change.index, change.value);
        } else throw std::runtime_error("Unknown engine operation.");
        json_object_set_new(result, "ok", json_true());
    } catch (const std::exception& error) {
        if (result) json_decref(result);
        result = json_pack("{s:b,s:s}", "ok", 0, "error", error.what());
    } catch (...) {
        if (result) json_decref(result);
        result = json_pack("{s:b,s:s}", "ok", 0, "error", "Cardinal could not complete the operation.");
    }
    char* serialized = json_dumps(result, JSON_COMPACT | JSON_SORT_KEYS);
    response = serialized ? serialized : "{\"ok\":false,\"error\":\"Could not serialize engine response.\"}";
    free(serialized);
    json_decref(result);
    if (input) json_decref(input);
    return response.c_str();
}
