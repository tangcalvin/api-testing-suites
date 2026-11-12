package com.philomath.api.web;

import com.philomath.api.dto.Order;
import com.philomath.api.dto.OrderCursorPage;
import com.philomath.api.dto.OrderPage;
import com.philomath.api.dto.OrderRequest;
import com.philomath.api.error.ApiErrorResponse;
import com.philomath.api.error.FieldException;
import com.philomath.api.store.OrderStore;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.List;

@RestController
@RequestMapping("/api/orders")
@Tag(name = "Orders", description = "Create, read, update, and delete orders")
public class OrderController {

    private final OrderStore orders;

    public OrderController(OrderStore orders) {
        this.orders = orders;
    }

    @GetMapping
    @Operation(summary = "List orders", responses = {
            @ApiResponse(responseCode = "200", description = "One page of orders",
                    content = @Content(schema = @Schema(implementation = OrderPage.class))),
            @ApiResponse(responseCode = "400", description = "page or size is out of range",
                    content = @Content(schema = @Schema(implementation = ApiErrorResponse.class)))
    })
    public ResponseEntity<?> list(
            @ParameterObject OrderFilter filter,
            @Parameter(description = "Zero-based page index. Defaults to 0.",
                    schema = @Schema(type = "integer", format = "int32", minimum = "0", defaultValue = "0"))
            @RequestParam(name = "page", defaultValue = "0") int page,
            @Parameter(description = "Page size from 1 to 100. Defaults to 20.",
                    schema = @Schema(type = "integer", format = "int32", minimum = "1", maximum = "100", defaultValue = "20"))
            @RequestParam(name = "size", defaultValue = "20") int size
    ) {
        if (page < 0) {
            return constraint("page", "Min", "page must be zero or greater");
        }
        if (size < 1) {
            return constraint("size", "Min", "size must be at least 1");
        }
        if (size > 100) {
            return constraint("size", "Max", "size must be at most 100");
        }
        Page<Order> result = orders.findAll(filter, page, size);
        OrderPage body = new OrderPage(result.getContent(), result.getNumber(), result.getSize(), result.getTotalElements(), result.getTotalPages());
        return ResponseEntity.ok(body);
    }

    @GetMapping("/cursor")
    @Operation(summary = "List orders by cursor", responses = {
            @ApiResponse(responseCode = "200", description = "Orders after the cursor",
                    content = @Content(schema = @Schema(implementation = OrderCursorPage.class))),
            @ApiResponse(responseCode = "400", description = "nextCursor or limit is out of range",
                    content = @Content(schema = @Schema(implementation = ApiErrorResponse.class)))
    })
    public ResponseEntity<?> listByCursor(
            @ParameterObject OrderFilter filter,
            @Parameter(description = "Cursor returned by the previous page. Omit this to start at the first order.")
            @RequestParam(name = "nextCursor", required = false) String nextCursor,
            @Parameter(description = "Page size from 1 to 100. Defaults to 20.",
                    schema = @Schema(type = "integer", format = "int32", minimum = "1", maximum = "100", defaultValue = "20"))
            @RequestParam(name = "limit", defaultValue = "20") int limit
    ) {
        if (limit < 1) {
            return constraint("limit", "Min", "limit must be at least 1");
        }
        if (limit > 100) {
            return constraint("limit", "Max", "limit must be at most 100");
        }
        Long afterId = null;
        if (nextCursor != null && !nextCursor.isBlank()) {
            try {
                afterId = Long.valueOf(nextCursor.trim());
            } catch (NumberFormatException exception) {
                return constraint("nextCursor", "InvalidFormat", "nextCursor must be a cursor from a previous page");
            }
            if (afterId < 0) {
                return constraint("nextCursor", "Min", "nextCursor must be zero or greater");
            }
        }
        return ResponseEntity.ok(orders.findAfter(filter, afterId, limit));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get one order", responses = {
            @ApiResponse(responseCode = "200", description = "Found",
                    content = @Content(schema = @Schema(implementation = Order.class))),
            @ApiResponse(responseCode = "404", description = "Order was not found",
                    content = @Content(schema = @Schema(implementation = ApiErrorResponse.class)))
    })
    public Order get(@PathVariable("id") long id) {
        return orders.findById(id).orElseThrow(() -> new OrderNotFoundException(id));
    }

    @PostMapping
    @Operation(summary = "Create an order", responses = {
            @ApiResponse(responseCode = "201", description = "Created",
                    content = @Content(schema = @Schema(implementation = Order.class))),
            @ApiResponse(responseCode = "400", description = "One or more fields failed schema validation",
                    content = @Content(schema = @Schema(implementation = ApiErrorResponse.class)))
    })
    public ResponseEntity<Order> create(@Valid @RequestBody OrderRequest request) {
        Order order = orders.create(request);
        return ResponseEntity.created(URI.create("/api/orders/" + order.id())).body(order);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Replace an order", responses = {
            @ApiResponse(responseCode = "200", description = "Replaced",
                    content = @Content(schema = @Schema(implementation = Order.class))),
            @ApiResponse(responseCode = "400", description = "One or more fields failed schema validation",
                    content = @Content(schema = @Schema(implementation = ApiErrorResponse.class))),
            @ApiResponse(responseCode = "404", description = "Order was not found",
                    content = @Content(schema = @Schema(implementation = ApiErrorResponse.class)))
    })
    public Order update(@PathVariable("id") long id, @Valid @RequestBody OrderRequest request) {
        return orders.update(id, request).orElseThrow(() -> new OrderNotFoundException(id));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete an order", responses = {
            @ApiResponse(responseCode = "204", description = "Deleted"),
            @ApiResponse(responseCode = "404", description = "Order was not found",
                    content = @Content(schema = @Schema(implementation = ApiErrorResponse.class)))
    })
    public ResponseEntity<Void> delete(@PathVariable("id") long id) {
        if (!orders.delete(id)) {
            throw new OrderNotFoundException(id);
        }
        return ResponseEntity.noContent().build();
    }

    private static ResponseEntity<ApiErrorResponse> constraint(String field, String code, String message) {
        return ResponseEntity.badRequest().body(new ApiErrorResponse(400, List.of(new FieldException(field, code, message))));
    }
}
