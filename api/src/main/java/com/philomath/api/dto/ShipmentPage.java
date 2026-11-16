package com.philomath.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;

@Schema(description = "One page of shipments. totalSize is the number of records in this page, not the full set. nextCursor is 0 when this is the last page.")
public record ShipmentPage(
        List<Shipment> content,
        @Schema(description = "Hashed cursor of the first key of the next page. 0 when there is no further page.", example = "0")
        String nextCursor,
        @Schema(description = "Number of shipments returned in this page", example = "20")
        int totalSize
) {
}
