package com.philomath.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.Map;

@Schema(description = "Fields accepted when updating a shipment. The id is part of the payload.")
public record ShipmentUpdate(
        @Schema(example = "1")
        @NotNull
        @Positive
        Long id,

        @Schema(example = "SHP-1001")
        @NotBlank
        @Size(max = 40)
        String reference,

        @Schema(example = "Ada Lovelace")
        @NotBlank
        @Size(max = 80)
        String recipient,

        @Schema(example = "HK")
        @NotBlank
        @Size(max = 2)
        @Pattern(regexp = "[A-Z]{2}")
        String destination,

        @Schema(example = "1.25")
        @NotNull
        @DecimalMin("0.01")
        @DecimalMax("10000.0")
        Double weightKg,

        @NotNull
        Priority priority,

        @NotNull
        ShipmentStatus status,

        @NotNull
        Boolean insured,

        @Schema(description = "Date the shipment is ready to leave", example = "2026-03-01", format = "date")
        LocalDate readyDate,

        @Schema(description = "Latest time the carrier will collect", example = "18:30:00", type = "string", format = "time")
        LocalTime cutoffTime,

        @Schema(description = "When the booking was recorded", example = "2026-03-01T10:15:30Z", format = "date-time")
        OffsetDateTime bookedAt,

        @Schema(description = "Must be an empty object when sent.", example = "{}", additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
        @Size(max = 0)
        Map<String, Object> packaging
) {
}
