#include <iostream>
#include <tuple>
#include "sprite_crustacean_data.h"
#include "sprite_crustacean_state.h"

void emit(char const* name, CrustaceanAnimationState& state) {
    std::cout << "{\"name\":\"" << name << "\",\"frame\":"
              << state.get_current_animation_instruction().frame
              << ",\"step\":" << state.current_animation_step
              << ",\"remainingMs\":" << state.current_animation_step_ms_left << "}";
}

int main() {
    CrustaceanSpriteDefinition definition;
    definition.animations.emplace("loop", CrustaceanAnimation{"loop", CrustaceanAnimationMode::Looping, {{0,5},{1,7},{2,11}}, {}});
    definition.animations.emplace("once", CrustaceanAnimation{"once", CrustaceanAnimationMode::Once, {{0,5},{1,7},{2,11}}, {}});
    definition.animations.emplace("speed", CrustaceanAnimation{"speed", CrustaceanAnimationMode::Looping, {{0,75},{1,75},{2,75}}, {}});
    definition.animations.emplace("ping", CrustaceanAnimation{"ping", CrustaceanAnimationMode::BackAndForth, {{0,5},{1,7},{2,11}}, {}});
    definition.animations.emplace("random", CrustaceanAnimation{"random", CrustaceanAnimationMode::Random, {{2,100},{3,100},{2,100}}, {}});
    CrustaceanAnimationState state;
    std::cout << "[";
    state.restart(&definition, "loop", nullptr); state.advance_by_n_ms(10); state.advance_by_n_ms(23); emit("uneven", state);
    std::cout << ",";
    state.restart(&definition, "once", nullptr); state.advance_by_n_ms(23); state.advance_by_n_ms(200); emit("once", state);
    std::cout << ",";
    state.restart(&definition, "speed", nullptr); state.advance_by_n_ms(37, 2); emit("quantized", state);
    std::cout << ",";
    state.restart(&definition, "speed", nullptr); state.advance_by_n_ms(60); state.advance_by_n_ms(0, 2); state.advance_by_n_ms(0, 1); emit("speed-carry", state);
    std::cout << ",";
    state.restart(&definition, "ping", nullptr); state.advance_by_n_ms(24); emit("ping", state);
    std::cout << ",";
    state.restart(&definition, "random", nullptr); state.advance_by_n_ms(300); emit("held-random", state);
    std::cout << "]\n";
}
