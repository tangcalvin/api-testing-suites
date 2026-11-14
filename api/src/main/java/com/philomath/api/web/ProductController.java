package com.philomath.api.web;

import com.philomath.api.dto.Product;
import com.philomath.api.dto.ProductPage;
import com.philomath.api.dto.ProductRequest;
import com.philomath.api.error.ApiErrorResponse;
import com.philomath.api.store.ProductStore;
import com.philomath.api.error.FieldException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.List;

@RestController
@RequestMapping("/api/products")
@Tag(name = "Products", description = "Create, read, update, and delete products")
public class ProductController {

    private final ProductStore products;

    public ProductController(ProductStore products) {
        this.products = products;
    }

    @GetMapping
    @Operation(operationId = "listProducts", summary = "List products", responses = {
            @ApiResponse(responseCode = "200", description = "Products after the cursor",
                    content = @Content(schema = @Schema(implementation = ProductPage.class))),
            @ApiResponse(responseCode = "400", description = "size or nextCursor is out of range",
                    content = @Content(schema = @Schema(implementation = ApiErrorResponse.class)))
    })
    public ResponseEntity<?> list(
            @Parameter(description = "Page size from 1 to 100. Defaults to 20.",
                    schema = @Schema(type = "integer", format = "int32", minimum = "1", maximum = "100", defaultValue = "20"))
            @RequestParam(name = "size", defaultValue = "20") int size,
            @Parameter(description = "Cursor returned by the previous page. Omit this to start at the first product.")
            @RequestParam(name = "nextCursor", required = false) String nextCursor
    ) {
        if (size < 1) {
            return constraint("size", "Min", "size must be at least 1");
        }
        if (size > 100) {
            return constraint("size", "Max", "size must be at most 100");
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
        return ResponseEntity.ok(products.findAfter(afterId, size));
    }

    @GetMapping("/{id}")
    @Operation(operationId = "getProduct", summary = "Get one product", responses = {
            @ApiResponse(responseCode = "200", description = "Found",
                    content = @Content(schema = @Schema(implementation = Product.class))),
            @ApiResponse(responseCode = "404", description = "Product was not found",
                    content = @Content(schema = @Schema(implementation = ApiErrorResponse.class)))
    })
    public Product get(@PathVariable("id") long id) {
        return products.findById(id).orElseThrow(() -> new ProductNotFoundException(id));
    }

    @PostMapping
    @Operation(operationId = "createProduct", summary = "Create a product", responses = {
            @ApiResponse(responseCode = "201", description = "Created",
                    content = @Content(schema = @Schema(implementation = Product.class))),
            @ApiResponse(responseCode = "400", description = "One or more fields failed schema validation",
                    content = @Content(schema = @Schema(implementation = ApiErrorResponse.class)))
    })
    public ResponseEntity<Product> create(@Valid @RequestBody ProductRequest request) {
        Product product = products.create(request);
        return ResponseEntity.created(URI.create("/api/products/" + product.id())).body(product);
    }

    @PutMapping("/{id}")
    @Operation(operationId = "replaceProduct", summary = "Replace a product", responses = {
            @ApiResponse(responseCode = "200", description = "Replaced",
                    content = @Content(schema = @Schema(implementation = Product.class))),
            @ApiResponse(responseCode = "400", description = "One or more fields failed schema validation",
                    content = @Content(schema = @Schema(implementation = ApiErrorResponse.class))),
            @ApiResponse(responseCode = "404", description = "Product was not found",
                    content = @Content(schema = @Schema(implementation = ApiErrorResponse.class)))
    })
    public Product update(@PathVariable("id") long id, @Valid @RequestBody ProductRequest request) {
        return products.update(id, request).orElseThrow(() -> new ProductNotFoundException(id));
    }

    @DeleteMapping("/{id}")
    @Operation(operationId = "deleteProduct", summary = "Delete a product", responses = {
            @ApiResponse(responseCode = "204", description = "Deleted"),
            @ApiResponse(responseCode = "404", description = "Product was not found",
                    content = @Content(schema = @Schema(implementation = ApiErrorResponse.class)))
    })
    public ResponseEntity<Void> delete(@PathVariable("id") long id) {
        if (!products.delete(id)) {
            throw new ProductNotFoundException(id);
        }
        return ResponseEntity.noContent().build();
    }

    private static ResponseEntity<ApiErrorResponse> constraint(String field, String code, String message) {
        return ResponseEntity.badRequest().body(new ApiErrorResponse(400, List.of(new FieldException(field, code, message))));
    }
}
