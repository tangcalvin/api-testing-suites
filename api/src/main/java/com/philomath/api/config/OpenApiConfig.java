package com.philomath.api.config;

import com.philomath.api.dto.OrderRequest;
import com.philomath.api.validation.MutuallyExclusive;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.media.Schema;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI apiTestingSuitesOpenApi() {
        return new OpenAPI().info(new Info()
                .title("API Testing Suites")
                .version("1.0.0")
                .description("Order CRUD API with field-level Jakarta validation. "
                        + "Validation failures return exceptions[], each with field and code. "
                        + "Export the document at /v3/api-docs (JSON) or /v3/api-docs.yaml (YAML)."));
    }

    @Bean
    public OpenApiCustomizer mutuallyExclusiveFields() {
        return openApi -> {
            if (openApi.getComponents() == null || openApi.getComponents().getSchemas() == null) {
                return;
            }
            publishExclusiveGroup(openApi.getComponents().getSchemas().get(OrderRequest.class.getSimpleName()), OrderRequest.class);
        };
    }

    private static void publishExclusiveGroup(Schema<?> schema, Class<?> type) {
        if (schema == null) {
            return;
        }
        MutuallyExclusive exclusive = type.getAnnotation(MutuallyExclusive.class);
        if (exclusive == null || exclusive.value().length < 2) {
            return;
        }
        schema.addExtension("x-mutually-exclusive", List.of(List.of(exclusive.value())));
    }
}
