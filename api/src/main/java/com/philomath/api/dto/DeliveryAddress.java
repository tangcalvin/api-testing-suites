package com.philomath.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;

@Schema(description = "Street address where the order is delivered. Optional: omit it, send null, or send an empty object. When any part is sent, the address fields are required.")
public record DeliveryAddress(
        @Schema(example = "1 Harbour Road")
        @NotBlank
        @Size(max = 120)
        String line1,

        @Schema(example = "Hong Kong")
        @NotBlank
        @Size(max = 80)
        String city,

        @Schema(example = "999077")
        @NotBlank
        @Size(max = 12)
        String postalCode,

        @NotNull
        @Valid
        Region region
) {
    @JsonCreator
    public static DeliveryAddress create(
            @JsonProperty("line1") String line1,
            @JsonProperty("city") String city,
            @JsonProperty("postalCode") String postalCode,
            @JsonProperty("region") Region region
    ) {
        if (blank(line1) && blank(city) && blank(postalCode) && empty(region)) {
            return null;
        }
        return new DeliveryAddress(line1, city, postalCode, region);
    }

    private static boolean empty(Region region) {
        return region == null || (blank(region.code()) && blank(region.name()));
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }
}
