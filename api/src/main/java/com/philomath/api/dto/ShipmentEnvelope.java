package com.philomath.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

public final class ShipmentEnvelope {

    private ShipmentEnvelope() {
    }

    @Schema(description = "Create a shipment. Attributes sit under data.")
    public record CreateCall(
            @Schema(example = "user-ada")
            @NotBlank
            @Size(max = 80)
            String userId,
            @NotNull
            @Valid
            ShipmentRequest data
    ) {
    }

    @Schema(description = "Identify one shipment. The id sits under data.")
    public record IdCall(
            @Schema(example = "user-ada")
            @NotBlank
            @Size(max = 80)
            String userId,
            @NotNull
            @Valid
            ShipmentId data
    ) {
    }

    @Schema(description = "Query shipments. Pagination and filters sit under data.")
    public record QueryCall(
            @Schema(example = "user-ada")
            @NotBlank
            @Size(max = 80)
            String userId,
            @Valid
            ShipmentQuery data
    ) {
    }

    @Schema(description = "Update a shipment. Attributes sit under data.")
    public record UpdateCall(
            @Schema(example = "user-ada")
            @NotBlank
            @Size(max = 80)
            String userId,
            @NotNull
            @Valid
            ShipmentUpdate data
    ) {
    }

    @Schema(description = "One shipment wrapped with the call outcome.")
    public record ItemReply(
            String userId,
            Shipment data,
            @Schema(example = "0")
            String code,
            @Schema(example = "")
            String message,
            List<ShipmentFault> exception
    ) {
    }

    @Schema(description = "One page of shipments wrapped with the call outcome.")
    public record PageReply(
            String userId,
            ShipmentPage data,
            @Schema(example = "0")
            String code,
            @Schema(example = "")
            String message,
            List<ShipmentFault> exception
    ) {
    }

    @Schema(description = "Acknowledgement for a shipment id wrapped with the call outcome.")
    public record AckReply(
            String userId,
            ShipmentId data,
            @Schema(example = "0")
            String code,
            @Schema(example = "")
            String message,
            List<ShipmentFault> exception
    ) {
    }

    @Schema(description = "Failed shipment call. data is omitted.")
    public record ErrorReply(
            String userId,
            Object data,
            @Schema(example = "ERR001")
            String code,
            @Schema(example = "Schema validation error")
            String message,
            List<ShipmentFault> exception
    ) {
    }

    public static ItemReply item(String userId, Shipment data) {
        return new ItemReply(userId, data, ShipmentCodes.OK, "", List.of());
    }

    public static PageReply page(String userId, ShipmentPage data) {
        return new PageReply(userId, data, ShipmentCodes.OK, "", List.of());
    }

    public static AckReply ack(String userId, ShipmentId data) {
        return new AckReply(userId, data, ShipmentCodes.OK, "", List.of());
    }

    public static ErrorReply fail(String userId, String message, List<ShipmentFault> exception) {
        List<ShipmentFault> faults = exception == null ? List.of() : exception;
        String code = faults.isEmpty() ? ShipmentCodes.VALUE : faults.getFirst().code();
        return new ErrorReply(userId, null, code, message == null ? "" : message, faults);
    }
}
