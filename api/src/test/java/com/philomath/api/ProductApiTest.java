package com.philomath.api;

import com.philomath.api.store.ProductStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import com.jayway.jsonpath.JsonPath;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class ProductApiTest {

    private static final String VALID_PRODUCT = """
            {
              "sku": "PRD-1001",
              "name": "Harbour mug",
              "unitPrice": 48.0,
              "currency": "HKD",
              "status": "ACTIVE",
              "stock": 12
            }
            """;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ProductStore products;

    @BeforeEach
    void emptyStore() {
        products.clear();
    }

    @Test
    void createsReadsUpdatesAndDeletesAProduct() throws Exception {
        MvcResult created = mockMvc.perform(post("/api/products")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_PRODUCT))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.sku").value("PRD-1001"))
                .andExpect(jsonPath("$.unitPrice").value(48.0))
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andReturn();
        String location = created.getResponse().getHeader("Location");

        mockMvc.perform(get(location))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Harbour mug"));

        String updated = VALID_PRODUCT.replace("\"stock\": 12", "\"stock\": 4");
        mockMvc.perform(put(location)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updated))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.stock").value(4));

        mockMvc.perform(delete(location))
                .andExpect(status().isNoContent());

        mockMvc.perform(get(location))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.exceptions[0].field").value("id"))
                .andExpect(jsonPath("$.exceptions[0].code").value("NotFound"));
    }

    @Test
    void pagesWithSizeAndNextCursor() throws Exception {
        create("PRD-1");
        create("PRD-2");
        create("PRD-3");

        MvcResult first = mockMvc.perform(get("/api/products").param("size", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content", hasSize(2)))
                .andExpect(jsonPath("$.content[0].sku").value("PRD-1"))
                .andExpect(jsonPath("$.content[1].sku").value("PRD-2"))
                .andExpect(jsonPath("$.size").value(2))
                .andExpect(jsonPath("$.totalSize").value(3))
                .andReturn();
        String cursor = JsonPath.read(first.getResponse().getContentAsString(), "$.nextCursor");

        mockMvc.perform(get("/api/products").param("size", "2").param("nextCursor", cursor))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content", hasSize(1)))
                .andExpect(jsonPath("$.content[0].sku").value("PRD-3"))
                .andExpect(jsonPath("$.size").value(2))
                .andExpect(jsonPath("$.totalSize").value(3))
                .andExpect(jsonPath("$.nextCursor").value(nullValue()));
    }

    @Test
    void rejectsABadSizeOrCursor() throws Exception {
        mockMvc.perform(get("/api/products").param("size", "0"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.exceptions[0].field").value("size"))
                .andExpect(jsonPath("$.exceptions[0].code").value("Min"));

        mockMvc.perform(get("/api/products").param("size", "101"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.exceptions[0].field").value("size"))
                .andExpect(jsonPath("$.exceptions[0].code").value("Max"));

        mockMvc.perform(get("/api/products").param("nextCursor", "abc"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.exceptions[0].field").value("nextCursor"))
                .andExpect(jsonPath("$.exceptions[0].code").value("InvalidFormat"));
    }

    @Test
    void publishesCursorPaginationInOpenApi() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.paths['/api/products'].get.tags[0]").value("Products"))
                .andExpect(jsonPath("$.paths['/api/products'].post").exists())
                .andExpect(jsonPath("$.paths['/api/products/{id}'].get").exists())
                .andExpect(jsonPath("$.paths['/api/products/{id}'].put").exists())
                .andExpect(jsonPath("$.paths['/api/products/{id}'].delete").exists())
                .andExpect(jsonPath("$.paths['/api/products'].get.parameters[?(@.name == 'size')]").exists())
                .andExpect(jsonPath("$.paths['/api/products'].get.parameters[?(@.name == 'nextCursor')]").exists())
                .andExpect(jsonPath("$.paths['/api/products'].get.parameters[?(@.name == 'page')]").isEmpty())
                .andExpect(jsonPath("$.paths['/api/products'].get.parameters[?(@.name == 'limit')]").isEmpty())
                .andExpect(jsonPath("$.components.schemas.ProductPage.properties.size").exists())
                .andExpect(jsonPath("$.components.schemas.ProductPage.properties.totalSize").exists())
                .andExpect(jsonPath("$.components.schemas.ProductPage.properties.nextCursor").exists())
                .andExpect(jsonPath("$.components.schemas.ProductPage.properties.content").exists());
    }

    private void create(String sku) throws Exception {
        mockMvc.perform(post("/api/products")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_PRODUCT.replace("PRD-1001", sku)))
                .andExpect(status().isCreated());
    }
}
