package com.philomath.api.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

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
}
